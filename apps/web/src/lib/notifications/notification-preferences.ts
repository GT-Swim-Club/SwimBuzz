export type NotificationPreferenceKey =
  | "practicePublished"
  | "meetRosterInfo"
  | "practiceComments"
  | "profileChanges"

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  practicePublished: true,
  meetRosterInfo: true,
  practiceComments: true,
  profileChanges: true,
}

export const NOTIFICATION_PREFERENCE_META: {
  key: NotificationPreferenceKey
  label: string
  description: string
  /** Shown to athletes when it differs from the coach/staff description. */
  athleteDescription?: string
  /** Hidden from coaches/staff in notification settings. */
  meetDirectorsOnly?: boolean
  athletesOnly?: boolean
}[] = [
  {
    key: "practicePublished",
    label: "New practices",
    description: "When a coach publishes a practice",
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

const ALL_PREFERENCE_KEYS: NotificationPreferenceKey[] = NOTIFICATION_PREFERENCE_META.map(
  (m) => m.key
)

export function parseNotificationPreferences(
  raw: unknown
): NotificationPreferences {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES }
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return prefs

  const obj = raw as Record<string, unknown>
  for (const key of ALL_PREFERENCE_KEYS) {
    if (typeof obj[key] === "boolean") prefs[key] = obj[key] as boolean
  }

  return prefs
}

export function mergeNotificationPreferences(
  current: unknown,
  patch: Partial<NotificationPreferences>
): NotificationPreferences {
  const prefs = parseNotificationPreferences(current)
  for (const key of ALL_PREFERENCE_KEYS) {
    if (typeof patch[key] === "boolean") prefs[key] = patch[key]
  }
  return prefs
}
