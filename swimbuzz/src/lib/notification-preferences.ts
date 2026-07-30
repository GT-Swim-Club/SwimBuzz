import { NotificationType } from "@prisma/client"

export type NotificationPreferenceKey =
  | "practicePublished"
  | "meetSignupOpen"
  | "practiceComments"
  | "profileChanges"

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean> & {
  meetSignupNotificationTimes?: number[]
}

// Keys used to iterate over notification preferences
export type AllPreferenceKey = NotificationPreferenceKey | "meetSignupNotificationTimes"

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  practicePublished: true,
  meetSignupOpen: true,
  practiceComments: true,
  profileChanges: true,
  meetSignupNotificationTimes: [0],
}

export const NOTIFICATION_PREFERENCE_META: {
  key: NotificationPreferenceKey
  label: string
  description: string
  /** Shown to athletes when it differs from the coach/staff description. */
  athleteDescription?: string
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

const ALL_PREFERENCE_KEYS: AllPreferenceKey[] = [
  ...NOTIFICATION_PREFERENCE_META.map((m) => m.key),
  "meetSignupNotificationTimes",
]

export function preferenceKeyForType(
  type: NotificationType
): NotificationPreferenceKey {
  switch (type) {
    case NotificationType.PRACTICE_PUBLISHED:
      return "practicePublished"
    case NotificationType.MEET_SIGNUP_OPEN:
      return "meetSignupOpen"
    case NotificationType.PRACTICE_COMMENT:
      return "practiceComments"
    case NotificationType.PROFILE_CHANGE_REQUEST:
    case NotificationType.PROFILE_CHANGE_APPROVED:
    case NotificationType.PROFILE_CHANGE_REJECTED:
    case NotificationType.TIMES_IMPORT_REQUEST:
      return "profileChanges"
  }
}

export function parseNotificationPreferences(
  raw: unknown
): NotificationPreferences {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES }
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return prefs

  const obj = raw as Record<string, unknown>
  for (const key of ALL_PREFERENCE_KEYS) {
    if (key === "meetSignupNotificationTimes") {
      if (Array.isArray(obj.meetSignupNotificationTimes)) {
        prefs.meetSignupNotificationTimes = obj.meetSignupNotificationTimes.filter(
          (m): m is number => typeof m === "number" && m >= 0 && m <= 60
        )
      } else if ("meetSignupOpen" in obj || "meetSignupOpenAdvanceEnabled" in obj) {
        // Backward compatibility migration
        const times = []
        if (obj.meetSignupOpen === true) times.push(0)
        if (
          obj.meetSignupOpenAdvanceEnabled === true &&
          typeof obj.meetSignupOpenAdvanceMinutes === "number"
        ) {
          times.push(Math.max(0, Math.min(60, obj.meetSignupOpenAdvanceMinutes)))
        }
        prefs.meetSignupNotificationTimes = times
      }
    } else if (typeof obj[key] === "boolean") {
      prefs[key as NotificationPreferenceKey] = obj[key] as boolean
    }
  }

  return prefs
}

export function mergeNotificationPreferences(
  current: unknown,
  patch: Partial<NotificationPreferences>
): NotificationPreferences {
  const prefs = parseNotificationPreferences(current)
  for (const key of ALL_PREFERENCE_KEYS) {
    if (key === "meetSignupNotificationTimes") {
      if (Array.isArray(patch.meetSignupNotificationTimes)) {
        prefs.meetSignupNotificationTimes = patch.meetSignupNotificationTimes.filter(
          (m): m is number => typeof m === "number" && m >= 0 && m <= 60
        )
      }
    } else if (key in patch && typeof patch[key as NotificationPreferenceKey] === "boolean") {
      prefs[key as NotificationPreferenceKey] = patch[key as NotificationPreferenceKey]!
    }
  }
  return prefs
}
