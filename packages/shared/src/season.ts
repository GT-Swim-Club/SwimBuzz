/** Club season runs Sep–Aug; infer from a "YYYY-MM-DD" day key (zoned or UTC, caller's choice). */
export function seasonFromDate(dayKey: string): string {
  const [yearStr, monthStr] = dayKey.split("-")
  const year = parseInt(yearStr ?? "", 10)
  const month = parseInt(monthStr ?? "", 10) - 1
  if (month >= 8) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

/** The season running right now (Sep–Aug boundary). */
export function currentSeason(): string {
  return seasonFromDate(new Date().toISOString().slice(0, 10))
}

/**
 * Newest season that should exist: the next one opens 1 June (UTC) so staff can
 * plan it over the summer, ahead of `currentSeason()` flipping in September.
 */
export function latestSeason(date: Date = new Date()): string {
  const year = date.getUTCFullYear()
  return date.getUTCMonth() >= 5 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/**
 * Default pick from a latest-first season list: the running season if listed,
 * so June–Aug doesn't jump ahead to the newly opened one; else the newest.
 */
export function defaultSeason(seasons: string[]): string | undefined {
  const current = currentSeason()
  return seasons.includes(current) ? current : seasons[0]
}
