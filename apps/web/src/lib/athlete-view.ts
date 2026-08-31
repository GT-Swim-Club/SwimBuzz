export const ATHLETE_VIEW_COOKIE = "swimbuzz-athlete-view"

/**
 * Dispatched on `window` the moment a staff member switches into Athlete
 * View, before the cookie-setting server action resolves. Lets a mounted
 * component holding a staff-only resource (e.g. a practice edit lock) release
 * it before the resulting redirect unmounts it — a same-tab navigation, so
 * `pagehide` never fires.
 */
export const ATHLETE_VIEW_ENABLING_EVENT = "swimbuzz:athlete-view-enabling"

/** Athlete View is a plain on/off toggle: staff either see their own staff view, or their own athlete view. */
export function isAthleteViewCookie(value: string | undefined | null): boolean {
  return value === "1" || value === "true"
}
