import { isStaffRole } from "./roles"

/**
 * Who sees which toggle in notification settings — shared so web Settings and
 * mobile Settings always agree. Driven only by the flags on
 * `NOTIFICATION_PREFERENCE_META`, so a new preference shows up on both clients
 * without touching the settings screens.
 */
export type NotificationPreferenceAudience = {
  key: string
  description: string
  /**
   * Shown instead of `description` to athletes. Staff who swim see `description`: they're sent the
   * staff notices too (every team record, comments on their practices), which it describes.
   */
  athleteDescription?: string
  /** Shown to anyone with an Athlete record (and to athlete-role users). */
  athletesOnly?: boolean
  /** Shown to coaches and exec. */
  staffOnly?: boolean
}

export type NotificationSettingsViewer = {
  role: string
  /** The user is linked to an Athlete record (swims on the roster). */
  hasAthleteRecord: boolean
}

/** Athlete toggles are for anyone who swims: an Athlete record, or an athlete-role account. */
export function seesAthleteNotificationToggles(viewer: NotificationSettingsViewer): boolean {
  return viewer.hasAthleteRecord || !isStaffRole(viewer.role)
}

export function visibleNotificationPreferences<T extends NotificationPreferenceAudience>(
  meta: readonly T[],
  viewer: NotificationSettingsViewer
): T[] {
  const athlete = seesAthleteNotificationToggles(viewer)
  const staff = isStaffRole(viewer.role)
  return meta.filter((item) => (!item.athletesOnly || athlete) && (!item.staffOnly || staff))
}

export function notificationPreferenceDescription(
  item: NotificationPreferenceAudience,
  viewer: NotificationSettingsViewer
): string {
  return !isStaffRole(viewer.role) && seesAthleteNotificationToggles(viewer) && item.athleteDescription
    ? item.athleteDescription
    : item.description
}
