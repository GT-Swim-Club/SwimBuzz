export const ATHLETE_VIEW_COOKIE = "swimbuzz-athlete-view"

/** Athlete View is a plain on/off toggle: staff either see their own staff view, or their own athlete view. */
export function isAthleteViewCookie(value: string | undefined | null): boolean {
  return value === "1" || value === "true"
}
