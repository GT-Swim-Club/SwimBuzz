import { zonedDayKey } from "./timezone"

export type NotificationPreferenceKey =
  | "practicePublished"
  | "meetSignupOpen"
  | "meetRosterInfo"
  | "meetDrops"
  | "practiceComments"
  | "profileChanges"

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean> & {
  meetSignupNotificationTimes?: number[]
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  practicePublished: true,
  meetSignupOpen: true,
  meetRosterInfo: true,
  meetDrops: true,
  practiceComments: true,
  profileChanges: true,
  meetSignupNotificationTimes: [0],
}

export const NOTIFICATION_PREFERENCE_META: {
  key: NotificationPreferenceKey
  label: string
  description: string
  athleteDescription?: string
  meetDirectorsOnly?: boolean
  athletesOnly?: boolean
}[] = [
  {
    key: "practicePublished",
    label: "New practices",
    description: "When a coach publishes a practice",
  },
  {
    key: "meetSignupOpen",
    label: "Meet signups",
    description: "When meet signups open",
  },
  {
    key: "meetRosterInfo",
    label: "Meet updates",
    description: "When new meet info is posted for a meet you're entered in",
    athleteDescription:
      "When psych sheets, heat sheets, results, or other meet info is posted for a meet you're on",
    athletesOnly: true,
  },
  {
    key: "meetDrops",
    label: "Meet drops",
    description: "When an athlete withdraws from a meet",
    meetDirectorsOnly: true,
  },
  {
    key: "practiceComments",
    label: "Practice comments",
    description: "When someone comments on your practice or replies to you",
    athleteDescription: "When someone replies to your comment",
  },
  {
    key: "profileChanges",
    label: "Athlete requests",
    description:
      "Profile changes, times import requests, and approval decisions",
  },
]

/**
 * Compact date range with no redundant month/year repetition: "Sep 4-24, 2026" when
 * both ends share a month, "Aug 31-Sep 1, 2026" when they share only a year, and the
 * full "Dec 30, 2025 – Jan 2, 2026" only when the year actually differs.
 */
export function formatCompactDateRange(start: Date, end: Date, timeZone: string): string {
  const monthDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone })
  const full = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone })
  const year = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", timeZone })
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short", timeZone })
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", timeZone })

  if (full(start) === full(end)) return full(start)
  const sameYear = year(start) === year(end)
  const sameMonth = sameYear && month(start) === month(end)
  if (sameMonth) return `${month(start)} ${day(start)}-${day(end)}, ${year(start)}`
  if (sameYear) return `${monthDay(start)}-${monthDay(end)}, ${year(start)}`
  return `${full(start)} – ${full(end)}`
}

export function formatMeetDateRange(
  startDate: string | Date,
  endDate: string | Date | null | undefined,
  timeZone: string
): string {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null
  if (!end) {
    return start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone })
  }
  return formatCompactDateRange(start, end, timeZone)
}

/**
 * Full, unabbreviated date range for hover/tap detail — never compacted, e.g.
 * "August 21, 2026 – August 24, 2026" (or just "August 21, 2026" for a single day).
 * The visible page text uses the compact `formatCompactDateRange`/`formatMeetDateRange`
 * above; hover detail should always spell out both ends in full.
 */
export function formatFullDateRange(start: Date, end: Date, timeZone: string): string {
  const full = (d: Date) => d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric", timeZone })
  if (full(start) === full(end)) return full(start)
  return `${full(start)} – ${full(end)}`
}

export function formatMeetDateRangeFull(
  startDate: string | Date,
  endDate: string | Date | null | undefined,
  timeZone: string
): string {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null
  if (!end) {
    return start.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric", timeZone })
  }
  return formatFullDateRange(start, end, timeZone)
}

/** "August 17, 2026" for an instant, formatted in `timeZone`. */
export function formatFullDate(value: string | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  })
}

export function formatClockTime(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ""
    return formatClockTime(`${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`)
  }
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return value
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 || 12
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

/** "07:30–09:00 PM" when both share AM/PM; otherwise "07:30 AM–12:00 PM". */
export function formatClockTimeRange(
  start: string | Date,
  end: string | Date
): string {
  const startText = formatClockTime(start)
  const endText = formatClockTime(end)
  if (!startText || !endText) return [startText, endText].filter(Boolean).join("–")
  const periodRe = /\s(AM|PM)$/
  const startPeriod = startText.match(periodRe)?.[1]
  const endPeriod = endText.match(periodRe)?.[1]
  if (startPeriod && endPeriod && startPeriod === endPeriod) {
    return `${startText.replace(periodRe, "")}–${endText}`
  }
  return `${startText}–${endText}`
}

export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}, ${formatClockTime(date)}`
}

/** "YYYY-MM-DD" for the calendar day an instant falls on in the runtime's local zone. */
export function localDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** "YYYY-MM-DD" for a date-only value stored at UTC midnight (Practice.date, Meet.startDate, swim dates). */
export function utcDayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/**
 * "Yesterday" | "Today" | "Tomorrow" when `dayKey` is within a day of `todayKey`,
 * otherwise null so the caller falls back to its own absolute format. Both args are
 * plain "YYYY-MM-DD" keys, so the diff is pure calendar math with no zone ambiguity.
 * An empty `todayKey` (the SSR case, before the viewer's clock is known) returns null.
 */
export function relativeDayLabel(dayKey: string, todayKey: string): string | null {
  if (!todayKey) return null
  if (dayKey === todayKey) return "Today"
  const today = new Date(`${todayKey}T00:00:00Z`)
  const day = new Date(`${dayKey}T00:00:00Z`)
  if (Number.isNaN(today.getTime()) || Number.isNaN(day.getTime())) return null
  const diffDays = Math.round((day.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 1) return "Tomorrow"
  if (diffDays === -1) return "Yesterday"
  return null
}

/** Relative label for a scheduled-event instant (Practice/Meet startsAt), evaluated in its own zone. */
export function relativeEventDayLabel(value: Date | string, timeZone: string, todayKey: string): string | null {
  return relativeDayLabel(zonedDayKey(value, timeZone), todayKey)
}

/** Relative label for a true instant (createdAt/closeAt/recordedAt), rendered in the local zone. */
export function relativeInstantDayLabel(value: Date | string, todayKey: string): string | null {
  return relativeDayLabel(localDayKey(value), todayKey)
}

export function athleteDisplayName(athlete: {
  firstName: string
  lastName: string
  nicknames?: string[]
}): string {
  const nick = athlete.nicknames?.[0]
  if (nick) return `${athlete.firstName} "${nick}" ${athlete.lastName}`
  return `${athlete.firstName} ${athlete.lastName}`
}

/**
 * Format an athlete for everyday, non-roster display. When an athlete has a
 * nickname, use it in place of their legal first name; otherwise fall back to
 * the legal name. Roster and athlete-profile views should continue to use
 * athleteDisplayName so they retain legal-name visibility.
 */
export function athletePreferredName(athlete: {
  firstName: string
  lastName: string
  nicknames?: string[]
}): string {
  const nickname = athlete.nicknames?.find((name) => name.trim().length > 0)?.trim()
  return `${nickname ?? athlete.firstName} ${athlete.lastName}`.trim()
}

/** Format a preferred athlete name in last-name-first order for compact lists. */
export function athletePreferredNameLastFirst(athlete: {
  firstName: string
  lastName: string
  nicknames?: string[]
}): string {
  const nickname = athlete.nicknames?.find((name) => name.trim().length > 0)?.trim()
  return `${athlete.lastName}, ${nickname ?? athlete.firstName}`
}

/** Return initials matching the athlete's preferred display name. */
export function athletePreferredInitials(athlete: {
  firstName: string
  lastName: string
  nicknames?: string[]
}): string {
  const preferredName = athlete.nicknames?.find((name) => name.trim().length > 0)?.trim()
  return `${(preferredName ?? athlete.firstName)[0] ?? ""}${athlete.lastName[0] ?? ""}`
}
/** Convert milliseconds to "1:23.45" or "58.32". */
export function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0")
  return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}`
}
