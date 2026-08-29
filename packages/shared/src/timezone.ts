import {
  formatClockTime,
  formatClockTimeRange,
  formatFullDate,
  formatFullDateRange,
} from "./format"

/** IANA zone used as the fallback when a record has no explicit zone or Intl can't resolve one. */
export const DEFAULT_TIME_ZONE = "America/New_York"

/** The US time zones surfaced in the zone picker on both web and mobile — the only options offered. */
export const US_TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
]

/** The device/browser's current IANA time zone, e.g. "America/Los_Angeles". */
export function getViewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

/** True if `timeZone` is a resolvable IANA zone id. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  )
  return asUtc - instant.getTime()
}

/** Resolve a wall-clock "YYYY-MM-DD" + "HH:MM" pair, interpreted in `timeZone`, to a real UTC instant. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number)
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim())
  const hour = match ? Number(match[1]) : 0
  const minute = match ? Number(match[2]) : 0
  const guessUtc = Date.UTC(year, (month || 1) - 1, day || 1, hour, minute, 0)
  const firstOffset = offsetMsAt(new Date(guessUtc), timeZone)
  const refinedOffset = offsetMsAt(new Date(guessUtc - firstOffset), timeZone)
  return new Date(guessUtc - refinedOffset)
}

/** Wall-clock date/hour/minute that `instant` falls on in `timeZone`. */
export function utcToZonedParts(
  instant: Date,
  timeZone: string
): { dateStr: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant)
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

/** Short zone abbreviation at a given instant, e.g. "EDT". Falls back to the raw id. */
export function zoneAbbreviation(timeZone: string, instant: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
      hour: "numeric",
    }).formatToParts(instant)
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone
  } catch {
    return timeZone
  }
}

/** Friendly zone name, e.g. "Eastern Daylight Time". Falls back to the raw id. */
export function zoneDisplayName(timeZone: string, instant: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "long",
      hour: "numeric",
    }).formatToParts(instant)
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone
  } catch {
    return timeZone
  }
}

/** "YYYY-MM-DD" for the calendar day an instant falls on in `timeZone`. Replaces utcDayKey for every practice/meet grouping call site. */
export function zonedDayKey(instant: Date | string, timeZone: string): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  return utcToZonedParts(date, timeZone).dateStr
}

function zonedDateLabel(instant: Date, timeZone: string): string {
  return instant.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  })
}

export type ZonedInstant = {
  /** "7:30 PM" */
  time: string
  /** "August 21, 2026" */
  date: string
  /** "August 21, 2026, 7:30 PM" */
  dateTime: string
  /** "EDT" */
  abbrev: string
  /** "Eastern Daylight Time" */
  zoneName: string
}

/** Format a single instant in `timeZone`. */
export function formatZonedInstant(instant: Date | string, timeZone: string): ZonedInstant {
  const date = instant instanceof Date ? instant : new Date(instant)
  const { hour, minute } = utcToZonedParts(date, timeZone)
  const time = formatClockTime(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)
  const dateLabel = zonedDateLabel(date, timeZone)
  return {
    time,
    date: dateLabel,
    dateTime: `${dateLabel}, ${time}`,
    abbrev: zoneAbbreviation(timeZone, date),
    zoneName: zoneDisplayName(timeZone, date),
  }
}

export type ZonedInstantRange = ZonedInstant & {
  /** True when the end instant falls on a different calendar day (in `timeZone`) than the start. */
  crossesDay: boolean
}

/**
 * Format a start–end range in `timeZone`, collapsing a shared AM/PM the way
 * formatClockTimeRange does. When the range crosses midnight (in `timeZone`), both the
 * start and end dates print in `time`/`dateTime`.
 */
export function formatZonedInstantRange(
  start: Date | string,
  end: Date | string | null | undefined,
  timeZone: string
): ZonedInstantRange {
  const startDate = start instanceof Date ? start : new Date(start)
  const startParts = utcToZonedParts(startDate, timeZone)
  const startHHMM = `${String(startParts.hour).padStart(2, "0")}:${String(startParts.minute).padStart(2, "0")}`
  const startDateLabel = zonedDateLabel(startDate, timeZone)
  const abbrev = zoneAbbreviation(timeZone, startDate)
  const zoneName = zoneDisplayName(timeZone, startDate)

  if (!end) {
    const time = formatClockTime(startHHMM)
    return {
      time,
      date: startDateLabel,
      dateTime: `${startDateLabel}, ${time}`,
      abbrev,
      zoneName,
      crossesDay: false,
    }
  }

  const endDate = end instanceof Date ? end : new Date(end)
  const endParts = utcToZonedParts(endDate, timeZone)
  const endHHMM = `${String(endParts.hour).padStart(2, "0")}:${String(endParts.minute).padStart(2, "0")}`
  const crossesDay = startParts.dateStr !== endParts.dateStr
  const fullRange = crossesDay ? formatFullDateRange(startDate, endDate, timeZone) : null
  const timeRange = formatClockTimeRange(startHHMM, endHHMM)

  const dateTime = crossesDay
    ? `${fullRange}, ${formatClockTime(startHHMM)} – ${formatClockTime(endHHMM)}`
    : `${startDateLabel}, ${timeRange}`

  return {
    time: timeRange,
    date: crossesDay ? fullRange! : startDateLabel,
    dateTime,
    abbrev,
    zoneName,
    crossesDay,
  }
}

export type ZoneDescriptionBlock = {
  /** "Eastern Daylight Time" */
  label: string
  /** Full date + time (range) text for this zone, e.g. "August 21, 2026, 7:30 – 9:00 PM" */
  dateTime: string
  abbrev: string
}

export type ZoneDescription = {
  /** One block when the two zones agree, two when they differ. First block is always `sourceTimeZone`. */
  blocks: ZoneDescriptionBlock[]
}

/**
 * The single source of truth for hover content on every date/time in the app. Every hover
 * on both platforms goes through this. Pass the record's stored zone as `sourceTimeZone`
 * for scheduled events (Practice/Meet/signup/room windows); for system instants, pass the
 * viewer's zone as `sourceTimeZone` (since that's what's visibly rendered) and
 * DEFAULT_TIME_ZONE as `viewerTimeZone` to compare against the club default.
 */
export function describeZones(
  start: Date | string,
  end: Date | string | null | undefined,
  sourceTimeZone: string,
  viewerTimeZone: string = getViewerTimeZone()
): ZoneDescription {
  const sourceRange = formatZonedInstantRange(start, end, sourceTimeZone)
  const sourceBlock: ZoneDescriptionBlock = {
    label: sourceRange.zoneName,
    dateTime: sourceRange.dateTime,
    abbrev: sourceRange.abbrev,
  }
  if (viewerTimeZone === sourceTimeZone) {
    return { blocks: [sourceBlock] }
  }
  const viewerRange = formatZonedInstantRange(start, end, viewerTimeZone)
  const viewerBlock: ZoneDescriptionBlock = {
    label: viewerRange.zoneName,
    dateTime: viewerRange.dateTime,
    abbrev: viewerRange.abbrev,
  }
  return { blocks: [sourceBlock, viewerBlock] }
}

/**
 * Hover/tap detail for a Meet's schedule. Unlike `describeZones`, this always spans the
 * full `startsAt`–`endsAt` *date* range (a meet never has a real end time — only an
 * optional end date for multi-day meets) and only adds a start time when `hasStartTime`
 * says there's a real clock time to show — placed right after the start date rather than
 * at the end of the range, e.g. "September 4, 2026 2:32 PM – September 24, 2026 EDT". One
 * line per zone block (source, plus the viewer's when it differs), each ending in the zone
 * abbreviation.
 */
export function describeMeetSchedule(
  startsAt: Date | string,
  endsAt: Date | string | null | undefined,
  hasStartTime: boolean,
  sourceTimeZone: string,
  viewerTimeZone: string = getViewerTimeZone()
): string[] {
  const zones = sourceTimeZone === viewerTimeZone ? [sourceTimeZone] : [sourceTimeZone, viewerTimeZone]
  const startDate = startsAt instanceof Date ? startsAt : new Date(startsAt)
  return zones.map((zone) => {
    const abbrev = zoneAbbreviation(zone, startDate)
    const startLabel = formatFullDate(startsAt, zone)
    const startLabelWithTime = hasStartTime
      ? `${startLabel}, ${formatZonedInstant(startsAt, zone).time}`
      : startLabel
    const endLabel = endsAt ? formatFullDate(endsAt, zone) : null
    if (!endLabel || endLabel === startLabel) return `${startLabelWithTime} ${abbrev}`
    return `${startLabelWithTime} – ${endLabel} ${abbrev}`
  })
}
