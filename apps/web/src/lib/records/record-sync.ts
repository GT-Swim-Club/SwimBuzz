import type { Prisma, RecordGender, TeamRecord } from "@prisma/client"
import { countsForRecords, recordEventDef, RECORD_EVENTS, type TeamRecordSwimmer } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import {
  effectiveRelayGender,
  effectiveRelayRound,
  isRelayLeadoffSwimTag,
  isRelayResultsSummary,
  leadoffSwimTags,
  RELAY_SPLIT_TAG_PREFIX,
  relayEventKey,
  relaySwimmerFullName,
  relayTeamKey,
  relayTeamTime,
  type RelayGender,
} from "@/lib/meet/relay-results"
import type { SheetEntry } from "@/lib/meet/meet-sheet-summary"
import { SWIMCLOUD_SOURCE } from "@/lib/swim/swimcloud-import"
import { parseSwimTime } from "@/lib/swim/swim-parse"
import { isRecordedRelay, isRecordedSwim, readRecordSwimmers, recordKey } from "@/lib/records/record-rows"
import { expireTopTimesCache } from "@/lib/records/top-times-cache"
import { notifyTeamRecordsBroken, type NewTeamRecord } from "@/lib/notifications/record-notify"

/** A swim or relay from an imported SCY meet that could hold a record. */
export type Candidate = {
  gender: RecordGender
  event: string
  timeMs: number
  date: Date
  swimmers: TeamRecordSwimmer[]
  leadoff: boolean
  meetId: string
  meetName: string
  swimId: string | null
  relayKey: string | null
}

export type AthleteName = { id: string; firstName: string; lastName: string; preferredName: string | null; gender: "M" | "F" }

const INDIVIDUAL_EVENTS = [...new Set(RECORD_EVENTS.filter((def) => !def.relay).map((def) => def.event))]

/**
 * Swims that count for records and top times: from imported SCY meets, never SwimCloud copies or
 * relay split legs (legs 2–4). DQs and other statuses are never stored as swims.
 */
export const RECORD_SWIM_WHERE = {
  course: "SCY",
  meetId: { not: null },
  source: { not: SWIMCLOUD_SOURCE },
  // Explicit as well as in the soft-delete policy, which a withDeleted(...) caller turns off.
  NOT: { tags: { startsWith: RELAY_SPLIT_TAG_PREFIX } },
  meetRef: { is: { deletedAt: null, course: "SCY" } },
} satisfies Prisma.SwimWhereInput

/** A record holder: by legal name ("Samuel Wygonik"), as records and top 10s show them. */
export function swimmerOf(athlete: Pick<AthleteName, "id" | "firstName" | "lastName">): TeamRecordSwimmer {
  return { name: `${athlete.firstName} ${athlete.lastName}`.trim(), athleteId: athlete.id }
}

/** A relay team's status (DQ, DNF, …) in the round its time is from, when the results gave one. */
function relayRoundStatus(entry: SheetEntry): string | undefined {
  const round = effectiveRelayRound(entry)
  if (round === "F") return entry.finalStatus ?? entry.resultStatus
  if (round === "P") return entry.prelimStatus ?? entry.resultStatus
  return entry.resultStatus
}

/** Individual swims from imported meets: never SwimCloud copies or relay split legs (legs 2–4). */
async function individualCandidates(): Promise<Candidate[]> {
  const swims = await prisma.swim.findMany({
    where: { ...RECORD_SWIM_WHERE, event: { in: INDIVIDUAL_EVENTS } },
    select: {
      id: true,
      event: true,
      timeMs: true,
      date: true,
      tags: true,
      meetId: true,
      meetRef: { select: { name: true, unofficial: true } },
      athlete: { select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true } },
    },
  })
  return swims.flatMap((swim): Candidate[] => {
    if (!swim.meetId || !swim.meetRef || swim.timeMs <= 0) return []
    if (!recordEventDef(swim.event, swim.athlete.gender)) return []
    // Unofficial meets only set records in 25s.
    if (!countsForRecords({ event: swim.event, unofficial: swim.meetRef.unofficial })) return []
    return [
      {
        gender: swim.athlete.gender,
        event: swim.event,
        timeMs: swim.timeMs,
        date: swim.date,
        swimmers: [swimmerOf(swim.athlete)],
        leadoff: isRelayLeadoffSwimTag(swim.tags),
        meetId: swim.meetId,
        meetName: swim.meetRef.name,
        swimId: swim.id,
        relayKey: null,
      },
    ]
  })
}

/**
 * Our relay teams' results in imported SCY meets (relayResultsSummary), skipping lineups with no
 * result time and DQ'd (or otherwise statused) teams.
 */
export async function relayCandidates(athletes: Map<string, AthleteName>): Promise<Candidate[]> {
  const meets = await prisma.meet.findMany({
    where: { course: "SCY", deletedAt: null },
    select: { id: true, name: true, startsAt: true, unofficial: true, relayResultsSummary: true },
  })
  const withRelays = meets.filter((meet) => isRelayResultsSummary(meet.relayResultsSummary))
  if (withRelays.length === 0) return []

  // Relay entries carry no date; the relay's lead-off swim does (the day it was swum).
  const leadoffs = await prisma.swim.findMany({
    where: { meetId: { in: withRelays.map((meet) => meet.id) }, tags: { startsWith: "R|" } },
    select: { meetId: true, tags: true, date: true },
  })
  const leadoffDates = new Map(leadoffs.map((swim) => [`${swim.meetId}|${swim.tags}`, swim.date]))
  const genders = new Map<string, RelayGender>([...athletes.values()].map((a) => [a.id, a.gender]))

  const out: Candidate[] = []
  for (const meet of withRelays) {
    if (!isRelayResultsSummary(meet.relayResultsSummary)) continue
    for (const entry of meet.relayResultsSummary.entries) {
      const gender = effectiveRelayGender(entry, genders)
      if (!gender) continue
      const event = relayEventKey(entry.event)
      if (!recordEventDef(event, gender)) continue
      // Unofficial meets set no relay records (only 25s count).
      if (!countsForRecords({ event, unofficial: meet.unofficial })) continue
      const timeMs = parseSwimTime(relayTeamTime(entry) ?? "")
      if (!timeMs || relayRoundStatus(entry)?.trim()) continue
      const round = effectiveRelayRound(entry)
      const legs = [...(entry.relaySwimmers ?? [])].sort((a, b) => a.leg - b.leg)
      const swimmers = [1, 2, 3, 4].map((leg): TeamRecordSwimmer => {
        const swimmer = legs.find((s) => s.leg === leg)
        const athlete = swimmer?.athleteId ? athletes.get(swimmer.athleteId) : undefined
        if (athlete) return swimmerOf(athlete)
        return { name: swimmer ? (relaySwimmerFullName(swimmer.name) ?? "") : "" }
      })
      out.push({
        gender,
        event,
        timeMs,
        date:
          leadoffDates.get(`${meet.id}|${leadoffSwimTags(entry.event, round, gender)}`) ??
          leadoffDates.get(`${meet.id}|${leadoffSwimTags(entry.event, round)}`) ??
          meet.startsAt,
        swimmers,
        leadoff: false,
        meetId: meet.id,
        meetName: meet.name,
        swimId: null,
        relayKey: `${meet.id}|${relayTeamKey(entry.event, entry.relayLetter, round, gender)}`,
      })
    }
  }
  return out
}

/** The swim or relay result behind a candidate (or a row linked to one). */
function sourceOf(candidate: Pick<Candidate, "swimId" | "relayKey">): string {
  return candidate.swimId ?? candidate.relayKey!
}

/** Fields a "meet" row copies from its candidate; also how a changed candidate is detected. */
function candidateData(candidate: Candidate) {
  return {
    timeMs: candidate.timeMs,
    year: candidate.date.getUTCFullYear(),
    date: candidate.date,
    swimmers: candidate.swimmers as unknown as Prisma.InputJsonValue,
    leadoff: candidate.leadoff,
    meetName: candidate.meetName,
    meetId: candidate.meetId,
  }
}

function sameAsCandidate(row: TeamRecord, candidate: Candidate): boolean {
  return (
    row.timeMs === candidate.timeMs &&
    row.date?.getTime() === candidate.date.getTime() &&
    row.leadoff === candidate.leadoff &&
    row.meetName === candidate.meetName &&
    JSON.stringify(readRecordSwimmers(row.swimmers)) === JSON.stringify(candidate.swimmers)
  )
}

/** Fields a sheet row takes from the imported swim or relay behind it (all null when it has none). */
function sheetLinkData(candidate: Candidate | undefined) {
  return {
    swimId: candidate?.swimId ?? null,
    relayKey: candidate?.relayKey ?? null,
    meetId: candidate?.meetId ?? null,
    meetName: candidate?.meetName ?? null,
    date: candidate?.date ?? null,
  }
}

function sameSheetLink(row: TeamRecord, candidate: Candidate | undefined): boolean {
  const data = sheetLinkData(candidate)
  return (
    row.swimId === data.swimId &&
    row.relayKey === data.relayKey &&
    row.meetId === data.meetId &&
    row.meetName === data.meetName &&
    row.date?.getTime() === data.date?.getTime()
  )
}

/** Whether a sheet row is this imported swim or relay: same time and year, and for a swim the same holder. */
function sheetRowMatches(row: TeamRecord, candidate: Candidate, athletes: Map<string, AthleteName>): boolean {
  if (candidate.relayKey) return isRecordedRelay(row, candidate)
  const athleteId = candidate.swimmers[0]?.athleteId
  const athlete = athleteId ? athletes.get(athleteId) : undefined
  return !!athlete && isRecordedSwim(row, { timeMs: candidate.timeMs, date: candidate.date, athleteId: athlete.id, athlete })
}

/**
 * Pair each sheet row (typed in from the records sheet or by staff) with the imported swim or relay
 * it matches, keeping a link that still holds. Each swim backs at most one row.
 */
function linkSheetRows(
  sheetRows: TeamRecord[],
  candidates: Candidate[],
  athletes: Map<string, AthleteName>
): Map<string, Candidate | undefined> {
  const links = new Map<string, Candidate | undefined>()
  const taken = new Set<string>()
  for (const row of sheetRows) {
    const linked = row.swimId ?? row.relayKey
    const candidate = linked ? candidates.find((c) => sourceOf(c) === linked) : undefined
    if (candidate && sheetRowMatches(row, candidate, athletes)) {
      links.set(row.id, candidate)
      taken.add(linked!)
    }
  }
  for (const row of sheetRows) {
    if (links.has(row.id)) continue
    const candidate = candidates.find((c) => !taken.has(sourceOf(c)) && sheetRowMatches(row, c, athletes))
    if (candidate) taken.add(sourceOf(candidate))
    links.set(row.id, candidate)
  }
  return links
}

/**
 * The imported swims and relays that were team records when swum: walking them in the order swum,
 * each one faster than every swim before it and every sheet record from before it. A sheet record
 * without a swim behind it is known only by its year, so it counts as set before every swim that
 * year. A same-day tie goes to the faster swim; a tie in time is never a new record.
 */
function recordsWhenSwum(
  candidates: Candidate[],
  sheetRows: TeamRecord[],
  links: Map<string, Candidate | undefined>
): Candidate[] {
  const order = [...candidates].sort((a, b) => a.date.getTime() - b.date.getTime() || a.timeMs - b.timeMs)
  const position = new Map(order.map((c, i) => [sourceOf(c), i]))
  const out: Candidate[] = []
  let fastestBefore = Infinity
  order.forEach((candidate, i) => {
    const sheetBefore = sheetRows.filter((row) => {
      const linked = links.get(row.id)
      if (linked) return position.get(sourceOf(linked))! < i
      return row.year <= candidate.date.getUTCFullYear()
    })
    const bar = Math.min(fastestBefore, ...sheetBefore.map((row) => row.timeMs))
    if (candidate.timeMs < bar) out.push(candidate)
    fastestBefore = Math.min(fastestBefore, candidate.timeMs)
  })
  return out
}

/**
 * Bring team records in step with imported meets. Each sheet row (records sheet or staff) is linked
 * to the imported swim or relay behind it, so it shows its meet and date. Every other imported swim
 * that was a team record when swum gets a "meet" row, kept matching its swim, so an event's history
 * runs from the sheet through imported results in the order they were set; "meet" rows that no
 * longer qualify (their swim is gone, or an earlier swim now beats them) are dropped. Swims behind a
 * row staff cleared are left out entirely. Idempotent; call after any write that changes imported
 * swims or relay results.
 */
export async function syncTeamRecords(): Promise<void> {
  const athleteRows = await prisma.athlete.findMany({
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const athletes = new Map(athleteRows.map((a) => [a.id, a]))
  const candidates = [...(await individualCandidates()), ...(await relayCandidates(athletes))]

  const byEvent = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const key = recordKey(c.gender, c.event)
    byEvent.set(key, [...(byEvent.get(key) ?? []), c])
  }

  /** Records this sync set from a swim; announced once the transaction commits. */
  const newRecords: NewTeamRecord[] = []

  await prisma.$transaction(
    async (tx) => {
      // One sync at a time, so two can't both promote the same swim.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"team-records"}))`
      const rows = await tx.teamRecord.findMany({ where: { course: "SCY" }, orderBy: { createdAt: "asc" } })

      const rowsByEvent = new Map<string, TeamRecord[]>()
      for (const row of rows) {
        const key = recordKey(row.gender, row.event)
        rowsByEvent.set(key, [...(rowsByEvent.get(key) ?? []), row])
      }

      for (const def of RECORD_EVENTS) {
        for (const gender of def.genders) {
          const key = recordKey(gender, def.event)
          const eventRows = rowsByEvent.get(key) ?? []
          const cleared = new Set(
            eventRows.filter((r) => r.dismissed).flatMap((r) => [r.swimId, r.relayKey]).filter((id): id is string => !!id)
          )
          const eventCandidates = (byEvent.get(key) ?? []).filter((c) => !cleared.has(sourceOf(c)))
          const sheetRows = eventRows.filter((r) => r.source !== "meet" && !r.dismissed)
          const meetRows = eventRows.filter((r) => r.source === "meet" && !r.dismissed)

          // Sheet rows take on the imported swim or relay behind them (or lose one that's gone).
          const links = linkSheetRows(sheetRows, eventCandidates, athletes)
          for (const row of sheetRows) {
            const linked = links.get(row.id)
            // Only clear what a link set: a row never linked keeps what was typed in.
            if (!linked && !row.swimId && !row.relayKey) continue
            if (!sameSheetLink(row, linked)) {
              await tx.teamRecord.update({ where: { id: row.id }, data: sheetLinkData(linked) })
            }
          }
          const linkedSources = new Set([...links.values()].flatMap((c) => (c ? [sourceOf(c)] : [])))

          // Every other imported swim that was a record when swum has its own "meet" row.
          const wanted = recordsWhenSwum(eventCandidates, sheetRows, links).filter((c) => !linkedSources.has(sourceOf(c)))
          const wantedSources = new Set(wanted.map(sourceOf))
          const kept = new Set<string>()
          for (const row of meetRows) {
            const source = row.swimId ?? row.relayKey ?? ""
            if (!wantedSources.has(source) || kept.has(source)) {
              await tx.teamRecord.delete({ where: { id: row.id } })
              continue
            }
            kept.add(source)
            const candidate = wanted.find((c) => sourceOf(c) === source)!
            if (!sameAsCandidate(row, candidate)) {
              await tx.teamRecord.update({ where: { id: row.id }, data: candidateData(candidate) })
            }
          }

          const fastestOther = Math.min(
            ...sheetRows.map((row) => row.timeMs),
            ...wanted.filter((c) => kept.has(sourceOf(c))).map((c) => c.timeMs)
          )
          for (const candidate of wanted) {
            if (kept.has(sourceOf(candidate))) continue
            await tx.teamRecord.create({
              data: {
                course: "SCY",
                gender,
                event: def.event,
                ...candidateData(candidate),
                swimId: candidate.swimId,
                relayKey: candidate.relayKey,
                source: "meet",
              },
            })
            // Announce only a new current record, not a past one filled in from older results.
            const current = candidate.timeMs < fastestOther && wanted.every((c) => c === candidate || c.timeMs > candidate.timeMs)
            if (!current) continue
            newRecords.push({
              gender,
              event: def.event,
              timeMs: candidate.timeMs,
              date: candidate.date,
              swimmers: candidate.swimmers,
              leadoff: candidate.leadoff,
              meetId: candidate.meetId,
              meetName: candidate.meetName,
            })
          }
        }
      }
    },
    { timeout: 30_000, maxWait: 10_000 }
  )
  // The Top 10 lists are built from the same swims, relays and athletes.
  expireTopTimesCache()
  notifyTeamRecordsBroken(newRecords)
}

/** syncTeamRecords for callers whose own write already succeeded: a failed sync is logged, not thrown. */
export async function syncTeamRecordsSafely(): Promise<void> {
  try {
    await syncTeamRecords()
  } catch (error) {
    console.error("[records] sync failed", error)
  }
}
