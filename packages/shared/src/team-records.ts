import { formatTime, meetFileName } from "./format"
import { DEFAULT_TIME_ZONE } from "./timezone"

/** Women's (F), men's (M), or mixed (X, relays only). */
export type RecordGender = "F" | "M" | "X"

export type RecordGroup = "Freestyle" | "Backstroke" | "Butterfly" | "Breaststroke" | "IM" | "Relays"

/** One row of the records table: an event with a record per gender it's swum in. */
export type RecordEventDef = {
  /** Normalized event name, matching imported swims ("50 Free", "400 Medley Relay"). */
  event: string
  /** The records sheet's label ("50 Freestyle", "200 Mixed Free Relay"). */
  label: string
  group: RecordGroup
  relay: boolean
  /** "X" for the mixed relay; women's and men's otherwise. */
  genders: RecordGender[]
}

const BOTH: RecordGender[] = ["F", "M"]

function individual(distances: number[], stroke: string, label: string, group: RecordGroup): RecordEventDef[] {
  return distances.map((d) => ({ event: `${d} ${stroke}`, label: `${d} ${label}`, group, relay: false, genders: BOTH }))
}

/** Every event the team keeps records in (SCY), in display order. */
export const RECORD_EVENTS: RecordEventDef[] = [
  ...individual([25, 50, 100, 200, 500, 1000, 1650], "Free", "Freestyle", "Freestyle"),
  ...individual([25, 50, 100, 200], "Back", "Backstroke", "Backstroke"),
  ...individual([25, 50, 100, 200], "Fly", "Butterfly", "Butterfly"),
  ...individual([25, 50, 100, 200], "Breast", "Breaststroke", "Breaststroke"),
  ...individual([100, 200, 400], "IM", "IM", "IM"),
  ...["200 Free Relay", "400 Free Relay", "800 Free Relay", "200 Medley Relay", "400 Medley Relay"].map(
    (event): RecordEventDef => ({ event, label: event, group: "Relays", relay: true, genders: BOTH })
  ),
  { event: "200 Free Relay", label: "200 Mixed Free Relay", group: "Relays", relay: true, genders: ["X"] },
]

/** The table row for an event in a gender, or undefined when the team keeps no record there. */
export function recordEventDef(event: string, gender: RecordGender): RecordEventDef | undefined {
  return RECORD_EVENTS.find((def) => def.event === event && def.genders.includes(gender))
}

export function isRecordGender(value: unknown): value is RecordGender {
  return value === "F" || value === "M" || value === "X"
}

export type TeamRecordSwimmer = {
  name: string
  athleteId?: string | null
  /** Linked athlete's slug (or id when it has none), for a profile link. */
  athleteSlug?: string | null
}

export type TeamRecordSource = "meet" | "manual" | "seed"

export type TeamRecordItem = {
  id: string
  gender: RecordGender
  event: string
  timeMs: number
  year: number
  /** ISO instant of the swim, or null for a year-only record. */
  date: string | null
  /** One swimmer for individual events; legs 1–4 for relays. */
  swimmers: TeamRecordSwimmer[]
  /** Set leading off a relay — shown "(R)". */
  leadoff: boolean
  meetName: string | null
  meetId: string | null
  /** Slug (or id) of the imported meet, for a link. */
  meetSlug: string | null
  source: TeamRecordSource
  /** Swum in the current season (dated records only). */
  isThisSeason: boolean
}

export type TeamRecordRow = RecordEventDef & {
  records: Partial<Record<RecordGender, TeamRecordItem>>
}

export type TeamRecordsResponse = {
  rows: TeamRecordRow[]
  season: string
}

export type TeamRecordHistoryResponse = {
  /** Newest first; the first one is the current record. */
  records: TeamRecordItem[]
}

/** Staff edit of an event's record (see lib/records/record-edit.ts for how it's applied). */
export type TeamRecordEditInput = {
  gender: RecordGender
  event: string
  /** "1:38.65" or "22.29". */
  time: string
  year: number
  /** "YYYY-MM-DD", or null for year-only. */
  date?: string | null
  swimmers: Array<{ name: string; athleteId?: string | null }>
  leadoff?: boolean
  meetName?: string | null
}

/** Parse a typed record time ("1:38.65", "22.29", "16:43.1") to ms, or null when it isn't one. */
export function parseRecordTime(input: string): number | null {
  const match = /^\s*(?:(\d{1,2}):)?(\d{1,2}(?:\.\d{1,2})?)\s*$/.exec(input)
  if (!match) return null
  const minutes = match[1] ? parseInt(match[1], 10) : 0
  const seconds = parseFloat(match[2]!)
  if (match[1] && seconds >= 60) return null
  const ms = Math.round((minutes * 60 + seconds) * 1000)
  return ms > 0 ? ms : null
}

/** A record time as the sheet writes it: "9.93", "1:38.65" (formatTime pads short times to "09.93"). */
export function formatRecordTime(ms: number): string {
  return ms < 60_000 ? (ms / 1000).toFixed(2) : formatTime(ms)
}

/** A record holder's name, or "–" when the sheet has none. */
export function recordSwimmerName(swimmer: TeamRecordSwimmer): string {
  return swimmer.name.trim() || "–"
}

/** A record holder as the sheet writes them: "Alex Rieger (R)" for a relay lead-off. */
export function recordSwimmerLabel(record: Pick<TeamRecordItem, "leadoff">, swimmer: TeamRecordSwimmer): string {
  const name = recordSwimmerName(swimmer)
  return record.leadoff ? `${name} (R)` : name
}

/** A record's time with a relay lead-off's "(R)" after it ("25.80 (R)"), as the exports show it. */
export function recordTimeLabel(record: Pick<TeamRecordItem, "timeMs" | "leadoff">): string {
  const time = formatRecordTime(record.timeMs)
  return record.leadoff ? `${time} (R)` : time
}

/** Year, or the full date when known, for a record's hover/press detail. */
export function recordSetLabel(record: Pick<TeamRecordItem, "year" | "date" | "meetName">): string {
  const when = record.date
    ? new Date(record.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : String(record.year)
  return record.meetName ? `${when} · ${record.meetName}` : when
}

/** The records export's header (PNG and PDF): gold eyebrow over the title. */
export const RECORDS_EXPORT = { eyebrow: "Georgia Tech Swim Club", title: "Team Records" } as const

/** "Team Records - Georgia Tech Swim Club.png" */
export function recordsExportFilename(ext: "png" | "pdf"): string {
  return meetFileName(RECORDS_EXPORT.title, RECORDS_EXPORT.eyebrow, ext)
}

/** The export's date line, "As of Nov 9, 2026", in the team's time zone. */
export function recordsAsOfLabel(date: Date = new Date()): string {
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: DEFAULT_TIME_ZONE,
  })
  return `As of ${day}`
}
