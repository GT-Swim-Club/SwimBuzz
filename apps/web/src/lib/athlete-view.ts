export const ATHLETE_VIEW_COOKIE = "swimbuzz-athlete-view"

export type AthleteViewState =
  | { enabled: false; athleteId: null }
  | { enabled: true; athleteId: string | null }

/** Parse the athlete-view cookie. Value is `0`/`false` (off), legacy `1`/`true` (on, no athlete), or an athlete id. */
export function parseAthleteViewCookie(value: string | undefined | null): AthleteViewState {
  if (!value || value === "0" || value === "false") {
    return { enabled: false, athleteId: null }
  }
  if (value === "1" || value === "true") {
    return { enabled: true, athleteId: null }
  }
  const athleteId = value.trim()
  if (!athleteId) return { enabled: false, athleteId: null }
  return { enabled: true, athleteId }
}

export function isAthleteViewCookie(value: string | undefined | null): boolean {
  return parseAthleteViewCookie(value).enabled
}

/** Cookie value for coach view or previewing as a specific athlete. */
export function athleteViewCookieValue(athleteId: string | null): string {
  return athleteId?.trim() || "0"
}
