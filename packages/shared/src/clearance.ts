/**
 * Physical & concussion clearance — whether an athlete has a physical on file and
 * has done their concussion baseline test for a season. Only cleared status and
 * dates; never anything medical. Visible to staff and the athlete themself only.
 */

export type ClearanceCheck = "physical" | "concussion"

export const CLEARANCE_CHECKS: ClearanceCheck[] = ["physical", "concussion"]

export type ClearanceItem = {
  cleared: boolean
  /** Calendar date "YYYY-MM-DD", when known. */
  date: string | null
}

export type AthleteClearanceStatus = {
  season: string
  physical: ClearanceItem
  concussion: ClearanceItem
  /** "IMPORT" or "MANUAL" for whichever wrote last; null when nothing is on file. */
  source: "IMPORT" | "MANUAL" | null
  updatedAt: string | null
}

/** One season-roster athlete on the staff clearance list. */
export type ClearanceListAthlete = AthleteClearanceStatus & {
  athleteId: string
  slug: string | null
  firstName: string
  lastName: string
  preferredName: string | null
  gender: "M" | "F"
}

export type ClearanceListResponse = {
  season: string
  athletes: ClearanceListAthlete[]
}

export type AthleteClearanceResponse = {
  /** One entry per season the athlete is on, newest first. */
  seasons: AthleteClearanceStatus[]
}

export type ClearanceItemInput = { cleared: boolean; date?: string | null }

export type UpdateAthleteClearanceInput = {
  season: string
  physical?: ClearanceItemInput
  concussion?: ClearanceItemInput
}

export const CLEARANCE_CHECK_LABEL: Record<ClearanceCheck, string> = {
  physical: "Physical",
  concussion: "Concussion test",
}

/** Checks still missing — empty when cleared. */
export function missingClearance(status: Pick<AthleteClearanceStatus, "physical" | "concussion"> | null | undefined): ClearanceCheck[] {
  if (!status) return [...CLEARANCE_CHECKS]
  return CLEARANCE_CHECKS.filter((check) => !status[check].cleared)
}

/** Short flag for an uncleared athlete ("No physical", "No concussion test", "Not cleared"); null when cleared. */
export function clearanceFlagLabel(missing: ClearanceCheck[]): string | null {
  if (missing.length === 0) return null
  if (missing.length > 1) return "Not cleared"
  return missing[0] === "physical" ? "No physical" : "No concussion test"
}

/** Longer explanation for a flag, e.g. "No physical or concussion test on file". */
export function clearanceFlagDetail(missing: ClearanceCheck[]): string | null {
  if (missing.length === 0) return null
  if (missing.length > 1) return "No physical or concussion test on file"
  return missing[0] === "physical" ? "No physical on file" : "No concussion test on file"
}

/** "Aug 15, 2026" for a "YYYY-MM-DD" calendar date (no timezone shift). */
export function formatClearanceDate(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}
