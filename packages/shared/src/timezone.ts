import { formatClockTime, formatClockTimeRange } from "./format"

/** IANA zone used as the fallback when a record has no explicit zone or Intl can't resolve one. */
export const DEFAULT_TIME_ZONE = "America/New_York"

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

export type ZonedClockTime = { text: string; abbrev: string; zoneName: string }

/**
 * Convert a wall-clock time stored as (date, time, sourceTimeZone) into the viewer's
 * current zone and format it, e.g. a practice entered as "19:30" in America/New_York
 * shown to a viewer in America/Los_Angeles becomes { text: "4:30 PM", abbrev: "PDT", ... }.
 */
export function formatClockTimeInViewerZone(
  dateStr: string,
  timeStr: string,
  sourceTimeZone: string,
  viewerTimeZone: string = getViewerTimeZone()
): ZonedClockTime {
  const instant = zonedTimeToUtc(dateStr, timeStr, sourceTimeZone)
  const { hour, minute } = utcToZonedParts(instant, viewerTimeZone)
  return {
    text: formatClockTime(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`),
    abbrev: zoneAbbreviation(viewerTimeZone, instant),
    zoneName: zoneDisplayName(viewerTimeZone, instant),
  }
}

/** Same as {@link formatClockTimeInViewerZone} but for a start–end range. */
export function formatClockTimeRangeInViewerZone(
  dateStr: string,
  startTime: string,
  endTime: string,
  sourceTimeZone: string,
  viewerTimeZone: string = getViewerTimeZone()
): ZonedClockTime {
  const startInstant = zonedTimeToUtc(dateStr, startTime, sourceTimeZone)
  const endInstant = zonedTimeToUtc(dateStr, endTime, sourceTimeZone)
  const start = utcToZonedParts(startInstant, viewerTimeZone)
  const end = utcToZonedParts(endInstant, viewerTimeZone)
  const startHHMM = `${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}`
  const endHHMM = `${String(end.hour).padStart(2, "0")}:${String(end.minute).padStart(2, "0")}`
  return {
    text: formatClockTimeRange(startHHMM, endHHMM),
    abbrev: zoneAbbreviation(viewerTimeZone, startInstant),
    zoneName: zoneDisplayName(viewerTimeZone, startInstant),
  }
}
