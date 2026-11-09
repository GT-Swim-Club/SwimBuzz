import type { TeamRecord } from "@prisma/client"
import {
  currentSeason,
  seasonFromDate,
  utcDayKey,
  type TeamRecordItem,
  type TeamRecordSource,
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

/** An event's current record: its latest established row that staff haven't cleared. */
export function currentRecordRow(rows: TeamRecord[]): TeamRecord | undefined {
  return rows
    .filter((row) => !row.dismissed)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .at(-1)
}

export type RecordLinks = {
  athleteSlugs: Map<string, string>
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
      athleteSlug: swimmer.athleteId ? (links.athleteSlugs.get(swimmer.athleteId) ?? null) : null,
    })),
    leadoff: row.leadoff,
    meetName: row.meetName,
    meetId: row.meetId,
    meetSlug: row.meetId ? (links.meetSlugs.get(row.meetId) ?? null) : null,
    source: row.source as TeamRecordSource,
    isThisSeason: !!row.date && seasonFromDate(utcDayKey(row.date)) === season,
  }
}
