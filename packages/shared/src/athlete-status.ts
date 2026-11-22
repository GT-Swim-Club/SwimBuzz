import { CLEARANCE_CHECK_ICON, CLEARANCE_CHECKS, clearanceStatusLine, type ClearanceItem } from "./clearance"
import type { IconName } from "./icons"

/**
 * Status icons shown beside an athlete's name (profile heading and roster rows, web and
 * mobile): physical, concussion test, and SwimCloud times. Staff only.
 */

/** Just the completion of each clearance check, as carried on athlete/roster payloads. */
export type AthleteClearanceSummary = { physical: ClearanceItem; concussion: ClearanceItem }

/** complete = green, partial = yellow, missing = red. */
export type AthleteStatusTone = "complete" | "partial" | "missing"

export type AthleteStatusKey = "physical" | "concussion" | "swimcloud"

export type AthleteStatusIcon = {
  key: AthleteStatusKey
  icon: IconName
  tone: AthleteStatusTone
  /** Tooltip / accessibility text, e.g. "Physical complete" or "SwimCloud times never imported". */
  label: string
}

/** "unlinked" = no SwimCloud profile, "never" = linked but no times imported, "imported" = times imported. */
export type SwimCloudTimesStatus = "unlinked" | "never" | "imported"

export function swimCloudTimesStatus(
  swimCloudIds: readonly unknown[] | null | undefined,
  timesSyncedAt: string | Date | null | undefined
): SwimCloudTimesStatus {
  if (!swimCloudIds || swimCloudIds.length === 0) return "unlinked"
  return timesSyncedAt ? "imported" : "never"
}

function importedDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

/** "No SwimCloud profile", "SwimCloud times never imported", "SwimCloud times imported Nov 3, 2026". */
export function swimCloudTimesLine(
  status: SwimCloudTimesStatus,
  timesSyncedAt: string | Date | null | undefined
): string {
  if (status === "unlinked") return "No SwimCloud profile"
  if (status === "never" || !timesSyncedAt) return "SwimCloud times never imported"
  return `SwimCloud times imported ${importedDate(timesSyncedAt)}`.trim()
}

/** Physical, concussion test, then SwimCloud times. Clearance is left out when the payload has none. */
export function athleteStatusIcons({
  clearance,
  swimCloudIds,
  timesSyncedAt,
}: {
  clearance?: AthleteClearanceSummary | null
  swimCloudIds?: readonly unknown[] | null
  timesSyncedAt?: string | Date | null
}): AthleteStatusIcon[] {
  const icons: AthleteStatusIcon[] = clearance
    ? CLEARANCE_CHECKS.map((check) => ({
        key: check,
        icon: CLEARANCE_CHECK_ICON[check],
        tone: clearance[check].cleared ? "complete" : "missing",
        label: clearanceStatusLine(check, clearance[check]),
      }))
    : []
  const swimCloud = swimCloudTimesStatus(swimCloudIds, timesSyncedAt)
  icons.push({
    key: "swimcloud",
    icon: "stopwatch",
    tone: swimCloud === "imported" ? "complete" : swimCloud === "never" ? "partial" : "missing",
    label: swimCloudTimesLine(swimCloud, timesSyncedAt),
  })
  return icons
}
