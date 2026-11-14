// The preference list lives in @swimbuzz/shared so web, mobile and the API share one copy.
export {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCE_KEYS,
  NOTIFICATION_PREFERENCE_META,
  isNotificationPreferenceKey,
  mergeNotificationPreferences,
  parseNotificationPreferences,
  type NotificationPreferenceKey,
  type NotificationPreferences,
} from "@swimbuzz/shared"
