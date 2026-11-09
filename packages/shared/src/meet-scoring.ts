/**
 * A meet's scoring table: the points each place scores, for individual events and for relays.
 * Index 0 is 1st place. Staff enter it on the meet; it scores finals and timed-finals swims the
 * results gave no points.
 */
export type ScoringTable = { individual: number[]; relay: number[] }

/** At most this many places (a table running past 24 places is a typo). */
export const SCORING_MAX_PLACES = 40

/** Points as written in the form: "20, 17, 16, 15" — commas, spaces or dashes between. */
export function parseScoringValues(text: string): number[] | null {
  const parts = text.split(/[\s,;–—-]+/).filter(Boolean)
  const values = parts.map(Number)
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null
  return values.slice(0, SCORING_MAX_PLACES)
}

/** "20, 17, 16, 15" for the form. */
export function formatScoringValues(values: number[] | undefined): string {
  return (values ?? []).join(", ")
}

/** The relay row's usual values: double the individual ones. */
export function doubledScoringValues(values: number[]): number[] {
  return values.map((value) => value * 2)
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
    .slice(0, SCORING_MAX_PLACES)
}

/** A stored or posted scoring table, or null when it has no values. */
export function coerceScoringTable(raw: unknown): ScoringTable | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const table = { individual: numbers(r.individual), relay: numbers(r.relay) }
  return table.individual.length > 0 || table.relay.length > 0 ? table : null
}

/** The points a place scores from one row of the table, or undefined past its end. */
export function placePoints(values: number[] | undefined, place: number | null | undefined): number | undefined {
  if (!values || place == null || !Number.isInteger(place) || place < 1) return undefined
  return values[place - 1]
}
