const SEASON_RE = /^(\d{4})-(\d{4})$/

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

/** Club season runs Sep–Aug; infer from a "YYYY-MM-DD" day key (zoned or UTC, caller's choice). */
export function seasonFromDate(dayKey: string): string {
  const [yearStr, monthStr] = dayKey.split("-")
  const year = parseInt(yearStr ?? "", 10)
  const month = parseInt(monthStr ?? "", 10) - 1
  if (month >= 8) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

export function upcomingSeason(): string {
  const date = new Date()
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  // Up to and including Sep (month 8), upcoming is this year-next.
  if (month <= 8) return `${year}-${year + 1}`
  // Oct or later, upcoming is next year-next+1.
  return `${year + 1}-${year + 2}`
}

export function currentSeason(): string {
  return seasonFromDate(new Date().toISOString().slice(0, 10))
}

/**
 * Prefer a requested season if it exists in `seasons` (latest-first).
 * Otherwise use the latest listed season, then the calendar season.
 */
export function resolveListedSeason(
  requested: unknown,
  seasons: string[],
  fallback = currentSeason()
): string {
  const parsed = parseSeason(requested)
  if (parsed && seasons.includes(parsed)) return parsed
  return seasons[0] ?? fallback
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
