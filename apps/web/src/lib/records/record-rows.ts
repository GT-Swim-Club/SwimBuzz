import type { TeamRecord } from "@prisma/client"
import {
  athletePreferredName,
  currentSeason,
  seasonFromDate,
  utcDayKey,
  type TeamRecordItem,
  type TeamRecordSwimmer,
} from "@swimbuzz/shared"

export function recordKey(gender: string, event: string): string {
  return `${gender}|${event}`
}

/** Stored `swimmers` JSON → [{ name, athleteId? }], dropping anything malformed. */
export function readRecordSwimmers(value: unknown): TeamRecordSwimmer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw): TeamRecordSwimmer[] => {
    if (!raw || typeof raw !== "object") return []
    const { name, athleteId } = raw as Record<string, unknown>
    if (typeof name !== "string") return []
    return [typeof athleteId === "string" && athleteId ? { name, athleteId } : { name }]
  })
}

/**
 * Newest record first. Each record beat the one before it, so newest first is fastest first; a tie
 * (never a new record) goes to the earlier swim.
 */
export function compareRecordRows(
  a: Pick<TeamRecord, "timeMs" | "year" | "date">,
  b: Pick<TeamRecord, "timeMs" | "year" | "date">
): number {
  return a.timeMs - b.timeMs || a.year - b.year || (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)
}

/** An event's current record: its fastest row that staff haven't cleared. */
export function currentRecordRow(rows: TeamRecord[]): TeamRecord | undefined {
  return rows.filter((row) => !row.dismissed).sort(compareRecordRows)[0]
}

type HolderAthlete = { firstName: string; lastName: string; preferredName: string | null }

export function holderNamed(name: string | undefined, athlete: HolderAthlete): boolean {
  const typed = name?.trim().toLowerCase()
  if (!typed) return false
  return typed === athletePreferredName(athlete).toLowerCase() || typed === `${athlete.firstName} ${athlete.lastName}`.toLowerCase()
}

/** A record row typed or seeded without its swim's link is that swim when time, year and holder agree. */
export function isRecordedSwim(
  row: Pick<TeamRecord, "timeMs" | "year" | "swimmers">,
  swim: { timeMs: number; date: Date; athleteId: string; athlete: HolderAthlete }
): boolean {
  if (row.timeMs !== swim.timeMs || row.year !== swim.date.getUTCFullYear()) return false
  const holder = readRecordSwimmers(row.swimmers)[0]
  return holder?.athleteId ? holder.athleteId === swim.athleteId : holderNamed(holder?.name, swim.athlete)
}

/** A relay record row without its result's link is that result when time and year agree. */
export function isRecordedRelay(row: Pick<TeamRecord, "timeMs" | "year">, relay: { timeMs: number; date: Date }): boolean {
  return relay.timeMs === row.timeMs && relay.date.getUTCFullYear() === row.year
}

/**
 * Typed in from the records sheet (or by staff) with no imported swim or relay behind it: the
 * records sync links a sheet row to the imported swim or relay it matches, so these are the rest.
 */
export function isManualRecord(row: Pick<TeamRecord, "source" | "swimId" | "relayKey">): boolean {
  return row.source !== "meet" && !row.swimId && !row.relayKey
}

/** A relay row's team key in its meet, without the "<meetId>|" prefix (the row carries the meet). */
export function relayKeyInMeet(relayKey: string | null, meetId: string | null): string | null {
  return relayKey && meetId && relayKey.startsWith(`${meetId}|`) ? relayKey.slice(meetId.length + 1) : null
}

export type RecordLinks = {
  athleteSlugs: Map<string, string>
  /** Each linked athlete's legal name ("Samuel Wygonik", not "Sam"): records show legal names. */
  athleteNames: Map<string, string>
  meetSlugs: Map<string, string>
}

export function toRecordItem(row: TeamRecord, links: RecordLinks): TeamRecordItem {
  const season = currentSeason()
  return {
    id: row.id,
    gender: row.gender,
    event: row.event,
    timeMs: row.timeMs,
    year: row.year,
    date: row.date?.toISOString() ?? null,
    swimmers: readRecordSwimmers(row.swimmers).map((swimmer) => ({
      ...swimmer,
      name: (swimmer.athleteId && links.athleteNames.get(swimmer.athleteId)) || swimmer.name,
      athleteSlug: swimmer.athleteId ? (links.athleteSlugs.get(swimmer.athleteId) ?? null) : null,
    })),
    leadoff: row.leadoff,
    meetName: row.meetName,
    meetId: row.meetId,
    meetSlug: row.meetId ? (links.meetSlugs.get(row.meetId) ?? null) : null,
    isThisSeason: !!row.date && seasonFromDate(utcDayKey(row.date)) === season,
    swimId: row.swimId,
    relayKey: relayKeyInMeet(row.relayKey, row.meetId),
    manual: isManualRecord(row),
  }
}
