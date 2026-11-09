import type { Prisma, RecordGender, TeamRecord } from "@prisma/client"
import {
  athletePreferredName,
  currentSeason,
  isRecordGender,
  parseRecordTime,
  recordEventDef,
  RECORD_EVENTS,
  type TeamRecordEditInput,
  type TeamRecordHistoryResponse,
  type TeamRecordRow,
  type TeamRecordsResponse,
} from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { currentRecordRow, readRecordSwimmers, recordKey, toRecordItem, type RecordLinks } from "@/lib/records/record-rows"
import { syncTeamRecords } from "@/lib/records/record-sync"

export class RecordInputError extends Error {}

const MAX_NAME_LENGTH = 80
const MAX_MEET_NAME_LENGTH = 120

async function recordLinks(rows: TeamRecord[]): Promise<RecordLinks> {
  const athleteIds = [
    ...new Set(rows.flatMap((row) => readRecordSwimmers(row.swimmers).map((s) => s.athleteId).filter((id): id is string => !!id))),
  ]
  const meetIds = [...new Set(rows.map((row) => row.meetId).filter((id): id is string => !!id))]
  const [athletes, meets] = await Promise.all([
    athleteIds.length > 0
      ? prisma.athlete.findMany({ where: { id: { in: athleteIds } }, select: { id: true, slug: true } })
      : [],
    meetIds.length > 0 ? prisma.meet.findMany({ where: { id: { in: meetIds } }, select: { id: true, slug: true } }) : [],
  ])
  return {
    athleteSlugs: new Map(athletes.map((a) => [a.id, a.slug ?? a.id])),
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

function requireEvent(gender: unknown, event: unknown): { gender: RecordGender; event: string } {
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
    orderBy: { createdAt: "desc" },
  })
  const links = await recordLinks(rows)
  return { records: rows.map((row) => toRecordItem(row, links)) }
}

/**
 * Link typed names to roster athletes: a given athleteId must exist, and an unlinked name links when
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

type ValidEdit = {
  gender: RecordGender
  event: string
  timeMs: number
  year: number
  date: Date | null
  swimmers: Array<{ name: string; athleteId?: string }>
  leadoff: boolean
  meetName: string | null
}

async function validateEdit(input: TeamRecordEditInput): Promise<ValidEdit> {
  const { gender, event } = requireEvent(input?.gender, input?.event)
  const def = recordEventDef(event, gender)!

  const timeMs = parseRecordTime(String(input.time ?? ""))
  if (!timeMs) throw new RecordInputError("Enter a time like 1:38.65 or 22.29")

  let date: Date | null = null
  if (input.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new RecordInputError("Invalid date")
    date = new Date(`${input.date}T00:00:00.000Z`)
    if (isNaN(date.getTime())) throw new RecordInputError("Invalid date")
  }
  const year = date ? date.getUTCFullYear() : Number(input.year)
  const latestYear = new Date().getUTCFullYear() + 1
  if (!Number.isInteger(year) || year < 1900 || year > latestYear) throw new RecordInputError("Enter a valid year")

  const legs = def.relay ? 4 : 1
  const raw = Array.isArray(input.swimmers) ? input.swimmers : []
  const swimmers = Array.from({ length: legs }, (_, i) => {
    const name = String(raw[i]?.name ?? "").trim().slice(0, MAX_NAME_LENGTH)
    const athleteId = typeof raw[i]?.athleteId === "string" ? raw[i]!.athleteId! : undefined
    return athleteId ? { name, athleteId } : { name }
  })
  await linkRecordSwimmers(swimmers, gender)
  if (!def.relay && !swimmers[0]!.name) throw new RecordInputError("Enter the swimmer's name")

  const meetName = typeof input.meetName === "string" ? input.meetName.trim().slice(0, MAX_MEET_NAME_LENGTH) || null : null
  return { gender, event, timeMs, year, date, swimmers, leadoff: !def.relay && !!input.leadoff, meetName }
}

/** Day a record was set, for ordering an edit against it; a year-only record counts as 1 January. */
function setDay(record: { year: number; date: Date | null }): number {
  return record.date?.getTime() ?? Date.UTC(record.year, 0, 1)
}

/**
 * Staff edit of an event's record. A later date than the current record's makes a new record (the
 * old one moves to history); otherwise it corrects the current record in place, which then stays as
 * staff set it. A faster imported swim still takes over on the sync that follows.
 */
export async function editTeamRecord(input: TeamRecordEditInput, userId: string): Promise<void> {
  const edit = await validateEdit(input)
  const data = {
    timeMs: edit.timeMs,
    year: edit.year,
    date: edit.date,
    swimmers: edit.swimmers as Prisma.InputJsonValue,
    leadoff: edit.leadoff,
    meetName: edit.meetName,
    source: "manual",
    updatedById: userId,
  }
  const current = currentRecordRow(
    await prisma.teamRecord.findMany({ where: { course: "SCY", gender: edit.gender, event: edit.event } })
  )
  if (current && setDay(edit) <= setDay(current)) {
    // Keep swimId/relayKey so the sync doesn't promote that same swim over the correction.
    await prisma.teamRecord.update({
      where: { id: current.id },
      data: { ...data, meetId: edit.meetName === current.meetName ? current.meetId : null },
    })
  } else {
    await prisma.teamRecord.create({ data: { course: "SCY", gender: edit.gender, event: edit.event, ...data } })
  }
  await syncTeamRecords()
}

/** Take a record row out: rows tied to an imported swim are only hidden, so the sync won't add them back. */
async function removeRow(row: TeamRecord): Promise<void> {
  if (row.swimId || row.relayKey) {
    await prisma.teamRecord.update({ where: { id: row.id }, data: { dismissed: true } })
  } else {
    await prisma.teamRecord.delete({ where: { id: row.id } })
  }
}

/** Clear an event's current record; the one before it (or the fastest imported swim) takes its place. */
export async function clearTeamRecord(gender: unknown, event: unknown): Promise<void> {
  const key = requireEvent(gender, event)
  const current = currentRecordRow(await prisma.teamRecord.findMany({ where: { course: "SCY", ...key } }))
  if (!current) return
  await removeRow(current)
  await syncTeamRecords()
}

/** Remove one record (current or past) from an event's history. */
export async function removeTeamRecord(id: string): Promise<boolean> {
  const row = await prisma.teamRecord.findUnique({ where: { id } })
  if (!row || row.dismissed) return false
  await removeRow(row)
  await syncTeamRecords()
  return true
}
