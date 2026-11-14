import {
  effectiveYearBySeason,
  MAX_ACADEMIC_YEAR_LENGTH,
  type YearBySeason,
} from "@swimbuzz/shared"
import { parseSeason } from "@/lib/season"

export class AthleteYearError extends Error {}

/**
 * Prisma data for an athlete's per-season years: entries only for seasons they're on, and the
 * legacy `year` set to their newest season's entry so older app builds still show one.
 */
export function athleteYearData(
  map: YearBySeason,
  seasons: readonly string[]
): { yearBySeason: YearBySeason; year: string | null } {
  const yearBySeason: YearBySeason = {}
  for (const season of seasons) {
    if (map[season]) yearBySeason[season] = map[season]
  }
  const newest = [...seasons].sort().at(-1)
  return { yearBySeason, year: (newest && yearBySeason[newest]) || null }
}

/**
 * Apply a staff edit `{ [season]: year | null }` (blank or null clears that season) onto the
 * athlete's years. Every season must be one they're on.
 */
export function applyYearEdits(
  athlete: { yearBySeason: unknown; year: string | null; seasons: string[] },
  edits: unknown
): { yearBySeason: YearBySeason; year: string | null } {
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) {
    throw new AthleteYearError("Years must be given per season")
  }
  const map = effectiveYearBySeason(athlete)
  for (const [raw, value] of Object.entries(edits)) {
    const season = parseSeason(raw)
    if (!season || !athlete.seasons.includes(season)) {
      throw new AthleteYearError("Athlete isn't on that season's roster")
    }
    if (value != null && typeof value !== "string") throw new AthleteYearError("Enter the year as text")
    const year = value?.trim() ?? ""
    if (year.length > MAX_ACADEMIC_YEAR_LENGTH) throw new AthleteYearError("Year is too long")
    if (year) map[season] = year
    else delete map[season]
  }
  return athleteYearData(map, athlete.seasons)
}
