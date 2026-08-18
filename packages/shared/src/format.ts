export type NotificationPreferenceKey =
  | "practicePublished"
  | "meetSignupOpen"
  | "meetRosterInfo"
  | "practiceComments"
  | "profileChanges"

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean> & {
  meetSignupNotificationTimes?: number[]
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  practicePublished: true,
  meetSignupOpen: true,
  meetRosterInfo: true,
  practiceComments: true,
  profileChanges: true,
  meetSignupNotificationTimes: [0],
}

export const NOTIFICATION_PREFERENCE_META: {
  key: NotificationPreferenceKey
  label: string
  description: string
  athleteDescription?: string
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

export function formatMeetDateRange(
  startDate: string | Date,
  endDate?: string | Date | null
): string {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : null
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
  if (!end || start.toDateString() === end.toDateString()) {
    return start.toLocaleDateString(undefined, opts)
  }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
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
