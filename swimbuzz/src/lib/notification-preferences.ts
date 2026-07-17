import { NotificationType } from "@prisma/client"

export type NotificationPreferenceKey =
  | "practicePublished"
  | "meetSignupOpen"
  | "practiceComments"
  | "profileChanges"

export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  practicePublished: true,
  meetSignupOpen: true,
  practiceComments: true,
  profileChanges: true,
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
    description: "When meet event signup opens",
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

const PREFERENCE_KEYS = NOTIFICATION_PREFERENCE_META.map((m) => m.key)

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
  for (const key of PREFERENCE_KEYS) {
    if (typeof obj[key] === "boolean") {
      prefs[key] = obj[key]
    }
  }
  return prefs
}

export function mergeNotificationPreferences(
  current: unknown,
  patch: Partial<NotificationPreferences>
): NotificationPreferences {
  const prefs = parseNotificationPreferences(current)
  for (const key of PREFERENCE_KEYS) {
    if (typeof patch[key] === "boolean") {
      prefs[key] = patch[key]!
    }
  }
  return prefs
}
