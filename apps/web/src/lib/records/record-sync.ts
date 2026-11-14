import type { Prisma, RecordGender, TeamRecord } from "@prisma/client"
import { athletePreferredName, recordEventDef, RECORD_EVENTS, type TeamRecordSwimmer } from "@swimbuzz/shared"
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
import { readRecordSwimmers, recordKey } from "@/lib/records/record-rows"
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

export function swimmerOf(athlete: Pick<AthleteName, "id" | "firstName" | "lastName" | "preferredName">): TeamRecordSwimmer {
  return { name: athletePreferredName(athlete), athleteId: athlete.id }
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
      meetRef: { select: { name: true } },
      athlete: { select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true } },
    },
  })
  return swims.flatMap((swim): Candidate[] => {
    if (!swim.meetId || !swim.meetRef || swim.timeMs <= 0) return []
    if (!recordEventDef(swim.event, swim.athlete.gender)) return []
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
    select: { id: true, name: true, startsAt: true, relayResultsSummary: true },
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
        date: leadoffDates.get(`${meet.id}|${leadoffSwimTags(entry.event, round)}`) ?? meet.startsAt,
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

/**
 * Bring team records in step with imported meets: keep each "meet" row matching the swim or relay
 * behind it (dropping it when that's gone or no longer beats the record before it), then make the
 * fastest imported swim the record wherever it beats the current one. Staff-set rows are never
 * touched. Idempotent; call after any write that changes imported swims or relay results.
 */
export async function syncTeamRecords(): Promise<void> {
  const athleteRows = await prisma.athlete.findMany({
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const athletes = new Map(athleteRows.map((a) => [a.id, a]))
  const candidates = [...(await individualCandidates()), ...(await relayCandidates(athletes))]
  const bySource = new Map<string, Candidate>()
  for (const c of candidates) bySource.set(c.swimId ?? c.relayKey!, c)

  const byEvent = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const key = recordKey(c.gender, c.event)
    byEvent.set(key, [...(byEvent.get(key) ?? []), c])
  }
  for (const list of byEvent.values()) list.sort((a, b) => a.timeMs - b.timeMs || a.date.getTime() - b.date.getTime())

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
          const eventRows: TeamRecord[] = []

          // Reconcile meet rows with their swims; earlier rows are already settled when a later one is checked.
          for (const row of rowsByEvent.get(key) ?? []) {
            if (row.source !== "meet" || row.dismissed) {
              eventRows.push(row)
              continue
            }
            const candidate = bySource.get(row.swimId ?? row.relayKey ?? "")
            const previous = eventRows.filter((r) => !r.dismissed).at(-1)
            const stillRecord =
              candidate &&
              candidate.gender === row.gender &&
              candidate.event === row.event &&
              (!previous || candidate.timeMs < previous.timeMs)
            if (!stillRecord) {
              await tx.teamRecord.delete({ where: { id: row.id } })
              continue
            }
            if (sameAsCandidate(row, candidate)) {
              eventRows.push(row)
            } else {
              eventRows.push(await tx.teamRecord.update({ where: { id: row.id }, data: candidateData(candidate) }))
            }
          }

          // Promote the fastest imported swim not already behind a row (including staff-cleared ones).
          const current = eventRows.filter((r) => !r.dismissed).at(-1)
          const used = new Set(eventRows.flatMap((r) => [r.swimId, r.relayKey]).filter(Boolean))
          const best = (byEvent.get(key) ?? []).find((c) => !used.has(c.swimId ?? c.relayKey))
          if (best && (!current || best.timeMs < current.timeMs)) {
            await tx.teamRecord.create({
              data: {
                course: "SCY",
                gender,
                event: def.event,
                ...candidateData(best),
                swimId: best.swimId,
                relayKey: best.relayKey,
                source: "meet",
              },
            })
            newRecords.push({
              gender,
              event: def.event,
              timeMs: best.timeMs,
              date: best.date,
              swimmers: best.swimmers,
              leadoff: best.leadoff,
              meetId: best.meetId,
              meetName: best.meetName,
            })
          }
        }
      }
    },
    { timeout: 30_000, maxWait: 10_000 }
  )
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
