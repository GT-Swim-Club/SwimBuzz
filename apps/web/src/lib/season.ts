import { currentSeason, defaultSeason } from "@swimbuzz/shared"

export { currentSeason, seasonFromDate } from "@swimbuzz/shared"

// Accepts an en/em dash too, so a displayed "2025–2026" typed back in still parses.
const SEASON_RE = /^(\d{4})\s*[-–—]\s*(\d{4})$/

/** e.g. 2026 → "2025-2026" (legacy end-year storage). */
export function endYearToSeason(endYear: number): string {
  return `${endYear - 1}-${endYear}`
}

/** End calendar year of a season label, e.g. "2025-2026" → 2026. */
export function seasonEndYear(season: string): number {
  const parsed = parseSeason(season)
  if (!parsed) throw new Error(`Invalid season: ${season}`)
  return parseInt(parsed.split("-")[1]!, 10)
}

/** Parse "2025-2026" or legacy end-year 2026 → "2025-2026". */
export function parseSeason(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  const match = s.match(SEASON_RE)
  if (match) {
    const start = parseInt(match[1]!, 10)
    const end = parseInt(match[2]!, 10)
    if (end === start + 1) return `${start}-${end}`
    return null
  }
  const year = parseInt(s, 10)
  if (Number.isFinite(year) && year >= 1990 && year <= 2100) {
    return endYearToSeason(year)
  }
  return null
}

/**
 * Prefer a requested season if it exists in `seasons` (latest-first).
 * Otherwise use the running season if listed, then the latest listed, then the calendar season.
 */
export function resolveListedSeason(
  requested: unknown,
  seasons: string[],
  fallback = currentSeason()
): string {
  const parsed = parseSeason(requested)
  if (parsed && seasons.includes(parsed)) return parsed
  return defaultSeason(seasons) ?? fallback
}

/** Recent seasons for dropdowns, most recent first. */
export function seasonOptions(count = 6): string[] {
  const end = seasonEndYear(currentSeason())
  return Array.from({ length: count }, (_, i) => endYearToSeason(end - i))
}

export function parseSeasonList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const out: string[] = []
  for (const v of values) {
    const s = parseSeason(v)
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}
