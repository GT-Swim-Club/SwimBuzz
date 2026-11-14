import { currentSeason } from "./season"
import { formatOrdinal } from "./team-scores"

/**
 * An athlete's academic year per season, e.g. { "2025-2026": "3", "2024-2025": "2" }. Values are
 * free text as imported or typed ("1"…"5", "2nd Year", "FR", "Sophomore", "Masters", "PhD").
 */
export type YearBySeason = Record<string, string>

/** Longest year value accepted from a form. */
export const MAX_ACADEMIC_YEAR_LENGTH = 40

const SEASON_RE = /^(\d{4})-(\d{4})$/

/** Start calendar year of a "2025-2026" season, or null for anything else. */
function seasonStart(season: string): number | null {
  const match = SEASON_RE.exec(season)
  return match ? Number(match[1]) : null
}

/** Newest of the athlete's seasons ("2025-2026" labels sort chronologically as strings). */
function newestSeason(seasons: readonly string[]): string | null {
  const valid = seasons.filter((season) => seasonStart(season) != null).sort()
  return valid.at(-1) ?? null
}

/** A stored `yearBySeason` JSON value as a clean map; anything malformed is dropped. */
export function parseYearBySeason(value: unknown): YearBySeason {
  const out: YearBySeason = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return out
  for (const [season, year] of Object.entries(value)) {
    if (seasonStart(season) == null || typeof year !== "string") continue
    const trimmed = year.trim()
    if (trimmed) out[season] = trimmed
  }
  return out
}

/** "1st Year" for "1", "PhD", "Masters"; any other value as is ("FR", "Junior"). */
export function formatAcademicYear(year: string): string {
  if (year.toLowerCase().includes("phd")) return "PhD"
  if (year.toLowerCase().includes("master")) return "Masters"
  const num = parseInt(year)
  if (isNaN(num)) return year
  return `${formatOrdinal(num)} Year`
}

/**
 * Class-name ladders. They have no fifth-year form, so a senior stays a senior going forward.
 * Numbered years go one further: after a 4th year comes a 5th, which is the top.
 */
const LADDERS = [
  ["freshman", "sophomore", "junior", "senior"],
  ["fr", "so", "jr", "sr"],
]
const NUMERIC_TOP = 5

/** `word` in the letter case of `template` ("FR" → "SO", "Fr" → "So", "fr" → "so"). */
function matchCase(template: string, word: string): string {
  if (template === template.toUpperCase()) return word.toUpperCase()
  if (template[0] === template[0]?.toUpperCase()) return word[0]!.toUpperCase() + word.slice(1)
  return word
}

/**
 * The year `steps` seasons later (positive) or earlier (negative), in the same style as `year`:
 * "2" → "3", "2nd Year" → "3rd Year", "FR" → "SO", "Junior" → "Senior", "4" → "5". Going forward a
 * 5th year and up, a senior (no fifth-year class name), a grad value (Masters, PhD) or anything
 * unrecognized stays as it is. Going back is the inverse ("5" → "4"); past a first year, or from a
 * value the ladder doesn't know, it gives null (unknown).
 */
export function stepAcademicYear(year: string, steps: number): string | null {
  const value = year.trim()
  if (!value) return null
  if (steps === 0) return value

  const numeric = /^(\d+)(st|nd|rd|th)?(\s*year)?$/i.exec(value)
  if (numeric) {
    const n = Number(numeric[1])
    const next = steps > 0 ? (n >= NUMERIC_TOP ? n : Math.min(n + steps, NUMERIC_TOP)) : n + steps
    if (next < 1) return null
    if (!numeric[2] && !numeric[3]) return String(next)
    const ordinal = numeric[2] ? formatOrdinal(next) : String(next)
    const ordinalCased = numeric[2] && numeric[2] === numeric[2].toUpperCase() ? ordinal.toUpperCase() : ordinal
    return `${ordinalCased}${numeric[3] ?? ""}`
  }

  const dotted = value.endsWith(".")
  const bare = dotted ? value.slice(0, -1) : value
  for (const ladder of LADDERS) {
    const index = ladder.indexOf(bare.toLowerCase())
    if (index < 0) continue
    const last = ladder.length - 1
    const next = steps > 0 ? (index >= last ? index : Math.min(index + steps, last)) : index + steps
    if (next < 0) return null
    return matchCase(bare, ladder[next]!) + (dotted ? "." : "")
  }

  return steps > 0 ? value : null
}

/**
 * A per-season map seeded from one year for the athlete's newest season, stepping back for the
 * earlier ones by the seasons between (a gap year steps twice). Earlier seasons the ladder can't
 * reach (before a first year, or a grad value) are left out.
 */
export function seedYearBySeason(year: string | null | undefined, seasons: readonly string[]): YearBySeason {
  const value = year?.trim()
  const newest = newestSeason(seasons)
  if (!value || !newest) return {}
  const newestStart = seasonStart(newest)!
  const out: YearBySeason = { [newest]: value }
  for (const season of seasons) {
    const start = seasonStart(season)
    if (start == null || season === newest) continue
    const stepped = stepAcademicYear(value, start - newestStart)
    if (stepped) out[season] = stepped
  }
  return out
}

type AthleteYearSource = {
  yearBySeason?: unknown
  /** Legacy single year, standing for the newest season until the per-season map is filled. */
  year?: string | null
  seasons?: readonly string[] | null
}

/**
 * The athlete's per-season years. Until the map is filled (backfill not yet run), the legacy single
 * `year` stands for their newest season and is stepped back for the earlier ones.
 */
export function effectiveYearBySeason(athlete: AthleteYearSource): YearBySeason {
  const map = parseYearBySeason(athlete.yearBySeason)
  if (Object.keys(map).length > 0) return map
  return seedYearBySeason(athlete.year, athlete.seasons ?? [])
}

/** The athlete's year in `season`, or null when unknown or not given. */
export function athleteYearForSeason(athlete: AthleteYearSource, season: string | null | undefined): string | null {
  if (!season) return null
  return effectiveYearBySeason(athlete)[season] ?? null
}

/**
 * Year to prefill when an athlete joins `season`: their nearest earlier season's year stepped up
 * once per season between (FR → SO → JR → SR, 4 → 5; 5th, senior and grad years stay), else
 * their nearest later season's stepped back. Null when there's nothing to go on. A year the
 * roster import supplies always wins over this.
 */
export function prefillYearForSeason(map: YearBySeason, season: string): string | null {
  const target = seasonStart(season)
  if (target == null) return null
  let before: [number, string] | null = null
  let after: [number, string] | null = null
  for (const [entry, year] of Object.entries(map)) {
    const start = seasonStart(entry)
    if (start == null || start === target) continue
    if (start < target && (!before || start > before[0])) before = [start, year]
    if (start > target && (!after || start < after[0])) after = [start, year]
  }
  const from = before ?? after
  return from ? stepAcademicYear(from[1], target - from[0]) : null
}

/**
 * The season whose year a page with no season of its own shows (athlete profile): `preferred` if
 * they're on it, else the running season if they're on it, else their newest season.
 */
export function athleteSeasonInView(seasons: readonly string[], preferred?: string | null): string | null {
  if (preferred && seasons.includes(preferred)) return preferred
  const current = currentSeason()
  if (seasons.includes(current)) return current
  return newestSeason(seasons)
}
