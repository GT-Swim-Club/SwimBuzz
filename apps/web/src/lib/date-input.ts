import { utcToZonedParts, zonedDayKey } from "@swimbuzz/shared"

/**
 * "YYYY-MM-DD" for `instant` in `timeZone`, suitable for populating an
 * `<input type="date">` (or comparing against one). Empty string when `instant` is null/undefined.
 *
 * Only for records with a real instant + IANA zone (Practice.startsAt, Meet.startsAt/endsAt).
 * Genuinely date-only fields (Swim.date, Athlete.dob) should use `utcDayKey` from
 * `@swimbuzz/shared` instead — they have no associated time zone to convert through.
 */
export function toDateInput(instant: Date | string | null | undefined, timeZone: string): string {
  if (!instant) return ""
  return zonedDayKey(instant, timeZone)
}

/**
 * "HH:MM" for `instant` in `timeZone`, suitable for populating an
 * `<input type="time">`. Empty string when `instant` is null/undefined.
 */
export function toTimeInput(instant: Date | string | null | undefined, timeZone: string): string {
  if (!instant) return ""
  const { hour, minute } = utcToZonedParts(instant instanceof Date ? instant : new Date(instant), timeZone)
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}
