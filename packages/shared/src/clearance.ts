/**
 * Physical & concussion clearance — whether an athlete has completed their physical
 * and their concussion baseline test. Both are done once (not per season).
 * Completion status only; never dates or anything medical. Staff only.
 */

export type ClearanceCheck = "physical" | "concussion"

export const CLEARANCE_CHECKS: ClearanceCheck[] = ["physical", "concussion"]

export type ClearanceItem = {
  cleared: boolean
}

export type AthleteClearanceStatus = {
  physical: ClearanceItem
  concussion: ClearanceItem
  /** "IMPORT" or "MANUAL" for whichever wrote last; null when nothing is recorded. */
  source: "IMPORT" | "MANUAL" | null
  updatedAt: string | null
}

/** One season-roster athlete on the staff clearance list (the season only picks the roster). */
export type ClearanceListAthlete = AthleteClearanceStatus & {
  athleteId: string
  slug: string | null
  firstName: string
  lastName: string
  preferredName: string | null
  gender: "M" | "F"
}

export type ClearanceListResponse = {
  /** The roster listed — clearance itself isn't per season. */
  season: string
  athletes: ClearanceListAthlete[]
}

export type AthleteClearanceResponse = {
  clearance: AthleteClearanceStatus
}

export type ClearanceItemInput = { cleared: boolean }

export type UpdateAthleteClearanceInput = {
  physical?: ClearanceItemInput
  concussion?: ClearanceItemInput
}

export const CLEARANCE_CHECK_LABEL: Record<ClearanceCheck, string> = {
  physical: "Physical",
  concussion: "Concussion test",
}

/** Icon (from `ICONS`) for each check, shown beside the athlete's name. */
export const CLEARANCE_CHECK_ICON = {
  physical: "stethoscope",
  concussion: "brain",
} as const satisfies Record<ClearanceCheck, string>

/** One check's status for a tooltip or label, e.g. "Physical complete" or "Concussion test incomplete". */
export function clearanceStatusLine(check: ClearanceCheck, item: ClearanceItem): string {
  return `${CLEARANCE_CHECK_LABEL[check]} ${item.cleared ? "complete" : "incomplete"}`
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

/** Longer explanation for a flag, e.g. "Physical and concussion test incomplete". */
export function clearanceFlagDetail(missing: ClearanceCheck[]): string | null {
  if (missing.length === 0) return null
  if (missing.length > 1) return "Physical and concussion test incomplete"
  return missing[0] === "physical" ? "Physical incomplete" : "Concussion test incomplete"
}
