import type { RecordGender, TeamRecord } from "@prisma/client"
import {
  athletePreferredName,
  currentSeason,
  isRecordGender,
  recordEventDef,
  RECORD_EVENTS,
  type TeamRecordHistoryResponse,
  type TeamRecordRow,
  type TeamRecordsResponse,
} from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { compareRecordRows, currentRecordRow, readRecordSwimmers, recordKey, toRecordItem, type RecordLinks } from "@/lib/records/record-rows"

export class RecordInputError extends Error {}

/**
 * Profile and meet slugs for the athletes and meets that records (or top times) point at, and the
 * athletes' legal names: records name linked holders by them, not by a preferred name.
 */
export async function recordLinks(rows: Array<{ swimmers: unknown; meetId: string | null }>): Promise<RecordLinks> {
  const athleteIds = [
    ...new Set(rows.flatMap((row) => readRecordSwimmers(row.swimmers).map((s) => s.athleteId).filter((id): id is string => !!id))),
  ]
  const meetIds = [...new Set(rows.map((row) => row.meetId).filter((id): id is string => !!id))]
  const [athletes, meets] = await Promise.all([
    athleteIds.length > 0
      ? prisma.athlete.findMany({
          where: { id: { in: athleteIds } },
          select: { id: true, slug: true, firstName: true, lastName: true },
        })
      : [],
    meetIds.length > 0 ? prisma.meet.findMany({ where: { id: { in: meetIds } }, select: { id: true, slug: true } }) : [],
  ])
  return {
    athleteSlugs: new Map(athletes.map((a) => [a.id, a.slug ?? a.id])),
    athleteNames: new Map(athletes.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()])),
    meetSlugs: new Map(meets.map((m) => [m.id, m.slug ?? m.id])),
  }
}

/** Every event in the records table with its current women's, men's or mixed record. */
export async function listTeamRecords(): Promise<TeamRecordsResponse> {
  const rows = await prisma.teamRecord.findMany({ where: { course: "SCY", dismissed: false } })
  const byKey = new Map<string, TeamRecord[]>()
  for (const row of rows) {
    const key = recordKey(row.gender, row.event)
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }
  const current = new Map<string, TeamRecord>()
  for (const [key, list] of byKey) {
    const row = currentRecordRow(list)
    if (row) current.set(key, row)
  }
  const links = await recordLinks([...current.values()])
  const out: TeamRecordRow[] = RECORD_EVENTS.map((def) => ({
    ...def,
    records: Object.fromEntries(
      def.genders.flatMap((gender) => {
        const row = current.get(recordKey(gender, def.event))
        return row ? [[gender, toRecordItem(row, links)]] : []
      })
    ),
  }))
  return { rows: out, season: currentSeason() }
}

export function requireEvent(gender: unknown, event: unknown): { gender: RecordGender; event: string } {
  if (!isRecordGender(gender) || typeof event !== "string" || !recordEventDef(event, gender)) {
    throw new RecordInputError("Unknown record event")
  }
  return { gender, event }
}

/** An event's records, newest first; the first is the current record. */
export async function teamRecordHistory(gender: unknown, event: unknown): Promise<TeamRecordHistoryResponse> {
  const key = requireEvent(gender, event)
  const rows = await prisma.teamRecord.findMany({
    where: { course: "SCY", ...key, dismissed: false },
  })
  const links = await recordLinks(rows)
  return { records: rows.sort(compareRecordRows).map((row) => toRecordItem(row, links)) }
}

/**
 * Link record holders' names (e.g. from the records sheet seed) to roster athletes: a given athleteId must exist, and an unlinked name links when
 * exactly one athlete (of the record's gender, for a women's or men's record) goes by it.
 */
export async function linkRecordSwimmers(swimmers: Array<{ name: string; athleteId?: string }>, gender: RecordGender) {
  const athletes = await prisma.athlete.findMany({
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const ids = new Set(athletes.map((a) => a.id))
  for (const swimmer of swimmers) {
    if (swimmer.athleteId && !ids.has(swimmer.athleteId)) delete swimmer.athleteId
    if (swimmer.athleteId || !swimmer.name) continue
    const name = swimmer.name.toLowerCase()
    const matches = athletes.filter(
      (a) =>
        (gender === "X" || a.gender === gender) &&
        (athletePreferredName(a).toLowerCase() === name || `${a.firstName} ${a.lastName}`.toLowerCase() === name)
    )
    if (matches.length === 1) swimmer.athleteId = matches[0]!.id
  }
}
