import { Gender } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { isResultStatusesSummary, meetHasImportedResults } from "@/lib/meet/meet-sheet-summary"
import {
  effectiveRelayGender,
  effectiveRelayRound,
  isRelayResultsSummary,
  normalizeRelayLetter,
  parseRelayGender,
  relayTeamKey,
  sanitizeRelaySplitTime,
  upsertRelayTeamEntries,
  type RelayGender,
  type RelayRound,
} from "@/lib/meet/relay-results"
import { isBuilderRelayLineup, meetHasFinalsSession, relayRoundHasResults } from "@/lib/meet/relay-rounds"
import { deleteRelayLeadoffSwim } from "@/lib/meet/relay-leadoff-sync"
import { syncMeetRelaySplitSwims } from "@/lib/meet/relay-split-sync"
import { relayEditConflict } from "@/lib/meet/relay-edit-lock"
import type { RelayEditLockInfo } from "@/lib/meet/relay-edit-lock-shared"
import { notifyRelayLineupChanges } from "@/lib/notifications/relay-lineup-notify"

/** One relay the builder publishes: a lettered team for a round ("" = the event's one lineup). */
export type BuilderLineupRow = {
  round: RelayRound
  letter: string
  seedTime?: string
  /** Athlete ids, leg 1 first. */
  legs: string[]
}

export type BuilderLineupInput = {
  /** Slot event, e.g. "200 Medley Relay". */
  event: string
  /** The build's relay name, stored on the published rows. */
  relayEvent: string
  gender: RelayGender
  /** Every relay the event should have published; empty unpublishes the builder's lineups. */
  rows: BuilderLineupRow[]
}

export function parseBuilderLineupInput(raw: unknown): BuilderLineupInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid request" }
  const body = raw as Record<string, unknown>
  const event = normalizeEventName(String(body.event ?? ""))
  const relayEvent = normalizeEventName(String(body.relayEvent ?? "")) || event
  const gender = parseRelayGender(body.gender)
  if (!event || !gender) return { error: "Event and gender are required" }
  if (!Array.isArray(body.rows) || body.rows.length > 8) return { error: "Invalid relays" }
  const rows: BuilderLineupRow[] = []
  const seen = new Set<string>()
  for (const item of body.rows) {
    if (!item || typeof item !== "object") return { error: "Invalid relay" }
    const row = item as Record<string, unknown>
    const round = row.round === "P" || row.round === "F" ? row.round : row.round === "" ? "" : null
    const letter = normalizeRelayLetter(String(row.letter ?? ""))
    if (round == null || !letter) return { error: "Each relay needs a letter and round" }
    const legs = Array.isArray(row.legs)
      ? row.legs.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64)
      : []
    if (legs.length !== 4 || new Set(legs).size !== 4) {
      return { error: `The ${letter} relay needs four different swimmers` }
    }
    const key = `${round}|${letter}`
    if (seen.has(key)) return { error: `The ${letter} relay is listed twice` }
    seen.add(key)
    const seedTime = String(row.seedTime ?? "").trim()
    rows.push({ round, letter, legs, ...(seedTime && seedTime !== "NT" ? { seedTime } : {}) })
  }
  return { event, relayEvent, gender, rows }
}

export type BuilderLineupResult =
  | { ok: true }
  | { ok: false; status: number; error: string; lock?: RelayEditLockInfo }

/**
 * Replace the relay builder's published lineups for one relay event in a single write: every
 * builder lineup of the event (any round, no results) gives way to `rows`. Imported relays and
 * relays with results are never touched; a row for a round whose results are in is refused.
 */
export async function publishBuilderLineups(
  meetId: string,
  input: BuilderLineupInput,
  userId: string,
  lockToken: string | null
): Promise<BuilderLineupResult> {
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    include: { _count: { select: { swims: true } } },
  })
  if (!meet) return { ok: false, status: 404, error: "Not found" }

  const conflict = await relayEditConflict(meetId, { event: input.event, gender: input.gender }, userId, lockToken)
  if (conflict) return { ok: false, status: 409, ...conflict }

  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const rosterIds = new Set(roster.map((a) => a.id))
  if (input.rows.some((row) => row.legs.some((id) => !rosterIds.has(id)))) {
    return { ok: false, status: 400, error: "All relay swimmers must be on the meet season roster" }
  }
  const athleteGenders = new Map<string, RelayGender>(roster.map((a) => [a.id, a.gender === Gender.F ? "F" : "M"]))
  const { event, gender } = input

  const existing = isRelayResultsSummary(meet.relayResultsSummary) ? meet.relayResultsSummary.entries : []
  const isOurs = (e: (typeof existing)[number]) => isBuilderRelayLineup(e, event, gender, athleteGenders)
  const removed = existing.filter(isOurs)
  const kept = existing.filter((e) => !isOurs(e))
  const keyOf = (e: (typeof existing)[number]) =>
    relayTeamKey(e.event, e.relayLetter, effectiveRelayRound(e), effectiveRelayGender(e, athleteGenders))
  const rowKey = (row: BuilderLineupRow) => relayTeamKey(input.relayEvent, row.letter, row.round, gender)

  for (const row of input.rows) {
    if (relayRoundHasResults(kept, event, gender, row.round, athleteGenders)) {
      return { ok: false, status: 409, error: `Results are already in for this relay${row.round === "F" ? "'s finals" : row.round === "P" ? "'s prelims" : ""}` }
    }
  }

  // Seeds can't be added once results are in, unless a lineup is already there — except at a meet
  // with a finals session, where a round this event hasn't swum yet (checked above) stays open:
  // later days' relays, or a finals lineup after prelims results.
  if (input.rows.length > 0 && !meetHasFinalsSession(meet)) {
    const resultsImported = meetHasImportedResults({
      swimCount: meet._count.swims,
      resultStatusEntries: isResultStatusesSummary(meet.resultStatusesSummary) ? meet.resultStatusesSummary.entries : null,
      relayResults: existing,
    })
    const removedKeys = new Set(removed.map(keyOf))
    const blocked = resultsImported && input.rows.some((row) => !removedKeys.has(rowKey(row)))
    if (blocked) {
      return {
        ok: false,
        status: 409,
        error: "Cannot add relay seeds to the roster summary after results have been imported.",
      }
    }
  }

  // Rows replacing a lineup of the same team and round keep its stored fields (event number, …).
  const rowKeys = new Set(input.rows.map(rowKey))
  let entries = [...kept, ...removed.filter((e) => rowKeys.has(keyOf(e)))]
  for (const row of input.rows) {
    entries = upsertRelayTeamEntries(
      entries,
      {
        event: input.relayEvent,
        relayLetter: row.letter,
        relayRound: row.round,
        gender,
        legs: row.legs.map((athleteId, i) => ({ leg: i + 1, athleteId })),
        seedTime: row.seedTime,
        manual: true,
      },
      roster,
      athleteGenders
    )
  }
  if (removed.length === 0 && input.rows.length === 0) return { ok: true }

  await prisma.meet.update({ where: { id: meetId }, data: { relayResultsSummary: { entries } } })
  notifyRelayLineupChanges({ meetId: meet.id, before: meet.relayResultsSummary, after: entries, actorUserId: userId })

  // A lineup edited in the roster editor may carry a lead-off split (and its swim): clear it when
  // that lead-off no longer swims leg 1 of the same team and round.
  const leadoffs = new Map(input.rows.map((row) => [rowKey(row), row.legs[0]]))
  let hadSplits = false
  for (const entry of removed) {
    if (entry.relaySwimmers?.some((s) => sanitizeRelaySplitTime(s.splitTime))) hadSplits = true
    const leg1 = entry.relaySwimmers?.find((s) => s.leg === 1)
    if (!leg1?.athleteId || !sanitizeRelaySplitTime(leg1.splitTime)) continue
    if (leadoffs.get(keyOf(entry)) === leg1.athleteId) continue
    await deleteRelayLeadoffSwim(
      meet,
      entry.event,
      leg1.athleteId,
      effectiveRelayRound(entry),
      effectiveRelayGender(entry, athleteGenders)
    )
  }
  if (hadSplits) await syncMeetRelaySplitSwims(meetId)
  return { ok: true }
}
