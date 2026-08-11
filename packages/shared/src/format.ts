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

export function athleteDisplayName(athlete: {
  firstName: string
  lastName: string
  nicknames?: string[]
}): string {
  const nick = athlete.nicknames?.[0]
  if (nick) return `${athlete.firstName} "${nick}" ${athlete.lastName}`
  return `${athlete.firstName} ${athlete.lastName}`
}

/** Convert milliseconds to "1:23.45" or "58.32". */
export function formatTime(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, "0")
  return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}`
}
