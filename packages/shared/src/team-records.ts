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
  /** The imported swim behind it (individual events), whose detail opens on its meet page. */
  swimId: string | null
  /** The relay behind it: its team key in its meet (event | letter | round | gender). */
  relayKey: string | null
  /** Swum in the current season (dated records only). */
  isThisSeason: boolean
  /** Typed in from the records sheet with no imported swim or relay behind it — shown with a "*". */
  manual: boolean
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

/** An event's top 10: each swimmer once at their best (performers) or the ten fastest swims (performances). */
export type TopTimesMode = "performers" | "performances"

export const TOP_TIMES_LIMIT = 10

export function isTopTimesMode(value: unknown): value is TopTimesMode {
  return value === "performers" || value === "performances"
}

/** One swim (or relay) in an event's top 10; ties share a rank, so a list can run past ten. */
export type TeamTopTime = {
  /** Stable key for lists. */
  key: string
  rank: number
  timeMs: number
  year: number
  /** ISO instant of the swim, or null for a year-only record. */
  date: string | null
  /** One swimmer for individual events; legs 1–4 for relays. */
  swimmers: TeamRecordSwimmer[]
  /** Swum leading off a relay — shown "(R)". */
  leadoff: boolean
  meetName: string | null
  meetSlug: string | null
  /** The imported swim behind it (individual events only), whose detail opens from the row. */
  swimId: string | null
  /** A relay's team key in its meet (event | letter | round | gender), whose detail opens from the row. */
  relayKey: string | null
  /** Was a team record when swum (current or past). */
  isRecord: boolean
  isThisSeason: boolean
  /** A record typed in from the records sheet with no imported swim or relay behind it — shown with a "*". */
  manual: boolean
}

export type TeamTopTimesResponse = {
  /** Relays are always "performances". */
  mode: TopTimesMode
  times: TeamTopTime[]
}

/** One event's top 10 in the all-events view. */
export type TeamTopTimesEvent = Pick<RecordEventDef, "event" | "label" | "group" | "relay"> & {
  /** The gender this list is for: the page's, or "X" for the mixed relay. */
  gender: RecordGender
  /** Relays are always "performances". */
  mode: TopTimesMode
  times: TeamTopTime[]
}

/** Every record event's top 10 for one gender (the mixed relay included), in records-table order. */
export type TeamAllTopTimesResponse = {
  gender: "F" | "M"
  mode: TopTimesMode
  events: TeamTopTimesEvent[]
  /** Start of the earliest imported meet the top 10s draw from (ISO), or null with none yet. */
  since: string | null
}

/** The events shown in a gender's top 10 view: its own, plus the mixed relay (both teams' event). */
export function topTimesEventDefs(gender: "F" | "M"): Array<RecordEventDef & { gender: RecordGender }> {
  return RECORD_EVENTS.flatMap((def): Array<RecordEventDef & { gender: RecordGender }> =>
    def.genders.includes(gender) ? [{ ...def, gender }] : def.genders.includes("X") ? [{ ...def, gender: "X" }] : []
  )
}

/**
 * A top 10 card's title, naming its gender: "Women 50 Freestyle", "Men 200 Medley Relay". The
 * mixed relay keeps its own label ("200 Mixed Free Relay").
 */
export function topTimesEventTitle(event: Pick<TeamTopTimesEvent, "gender" | "label">): string {
  if (event.gender === "X") return event.label
  return `${event.gender === "F" ? "Women" : "Men"} ${event.label}`
}

/** "Women Top 10 Performers", "Men Top 10 Performances" */
export function topTimesTitle(gender: "F" | "M", mode: TopTimesMode): string {
  return `${gender === "F" ? "Women" : "Men"} Top 10 ${mode === "performers" ? "Performers" : "Performances"}`
}

/**
 * The span a top 10 export covers, under its title: "Nov 1, 2017 – Nov 23, 2026", from the earliest
 * imported meet (`since`) to today, in the team's time zone. Just today's date with no meets yet.
 */
export function topTimesSpanLabel(since: string | null, today: Date = new Date()): string {
  const day = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: DEFAULT_TIME_ZONE })
  const start = since ? new Date(since) : null
  return start && !Number.isNaN(start.getTime()) ? `${day(start)} – ${day(today)}` : day(today)
}

/** "Women Top 10 Performers - Georgia Tech Swim Club.pdf" */
export function topTimesExportFilename(gender: "F" | "M", mode: TopTimesMode): string {
  return meetFileName(topTimesTitle(gender, mode), RECORDS_EXPORT.eyebrow, "pdf")
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

/** Marker before a manually added record's time ("*22.48"), the same gold "*" as an unofficial time. */
export const MANUAL_RECORD_MARK = "*"

/** Tooltip / accessible label for a manually added record. */
export const MANUAL_RECORD_LABEL = "Added manually, not from imported results"

/** A formatted record time with the manual marker when it applies: "*22.48". */
export function markManualRecord(formatted: string, manual?: boolean | null): string {
  return manual ? `${MANUAL_RECORD_MARK}${formatted}` : formatted
}

/** Footnote for exports that list any manually added record. */
export const MANUAL_RECORD_FOOTNOTE = `${MANUAL_RECORD_MARK} ${MANUAL_RECORD_LABEL}`

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

/** The export's date line, "Rev. Nov 9, 2026", in the team's time zone. */
export function recordsAsOfLabel(date: Date = new Date()): string {
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: DEFAULT_TIME_ZONE,
  })
  return `Rev. ${day}`
}
