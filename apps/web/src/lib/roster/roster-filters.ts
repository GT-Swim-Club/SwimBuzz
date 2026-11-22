import { swimCloudTimesStatus, type AthleteClearanceSummary } from "@swimbuzz/shared"

/**
 * Roster filters (gender for everyone; clearance and SwimCloud status for staff) and search,
 * shared by the roster page and its PDF export so both list the same athletes.
 */

/** What the filters and search read from an athlete. */
export type FilterableAthlete = {
  firstName: string
  lastName: string
  preferredName: string | null
  gender: string
  swimCloudIds: readonly unknown[]
  timesSyncedAt: string | Date | null
  clearance: AthleteClearanceSummary | null
}

export type GenderFilter = "all" | "M" | "F"
export type ClearanceFilter = "all" | "cleared" | "uncleared" | "physical" | "concussion"
export type SwimCloudFilter = "all" | "imported" | "never" | "unlinked"

export type RosterFilters = { gender: GenderFilter; clearance: ClearanceFilter; swimcloud: SwimCloudFilter }

export const GENDER_OPTIONS: Array<[GenderFilter, string]> = [
  ["all", "All"],
  ["M", "Men"],
  ["F", "Women"],
]

export const CLEARANCE_OPTIONS: Array<[ClearanceFilter, string]> = [
  ["all", "All"],
  ["cleared", "Cleared"],
  ["uncleared", "Not cleared"],
  ["physical", "No physical"],
  ["concussion", "No concussion test"],
]

export const SWIMCLOUD_OPTIONS: Array<[SwimCloudFilter, string]> = [
  ["all", "All"],
  ["imported", "Times imported"],
  ["never", "Never imported"],
  ["unlinked", "No SwimCloud profile"],
]

function pick<T extends string>(options: Array<[T, string]>, raw: string | null): T {
  return options.find(([value]) => value === raw)?.[0] ?? options[0][0]
}

/** Read the filters from the URL; the staff-only ones are ignored for everyone else. */
export function readRosterFilters(params: Pick<URLSearchParams, "get">, staff: boolean): RosterFilters {
  return {
    gender: pick(GENDER_OPTIONS, params.get("gender")),
    clearance: staff ? pick(CLEARANCE_OPTIONS, params.get("clearance")) : "all",
    swimcloud: staff ? pick(SWIMCLOUD_OPTIONS, params.get("swimcloud")) : "all",
  }
}

export function rosterFiltersActive(filters: RosterFilters): boolean {
  return filters.gender !== "all" || filters.clearance !== "all" || filters.swimcloud !== "all"
}

export function matchesRosterFilters(athlete: FilterableAthlete, filters: RosterFilters): boolean {
  if (filters.gender !== "all" && athlete.gender !== filters.gender) return false
  if (filters.clearance !== "all") {
    const physical = athlete.clearance?.physical.cleared ?? false
    const concussion = athlete.clearance?.concussion.cleared ?? false
    const ok =
      filters.clearance === "cleared"
        ? physical && concussion
        : filters.clearance === "uncleared"
          ? !physical || !concussion
          : filters.clearance === "physical"
            ? !physical
            : !concussion
    if (!ok) return false
  }
  if (filters.swimcloud !== "all" && swimCloudTimesStatus(athlete.swimCloudIds, athlete.timesSyncedAt) !== filters.swimcloud) {
    return false
  }
  return true
}

/** Search by legal or preferred name. */
export function matchesRosterSearch(athlete: FilterableAthlete, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return (
    `${athlete.firstName} ${athlete.lastName}`.toLowerCase().includes(needle) ||
    !!athlete.preferredName?.toLowerCase().includes(needle)
  )
}

/** The option's label ("No physical"), for a filter's current value. */
export function rosterFilterLabel<T extends string>(options: Array<[T, string]>, value: T): string {
  return options.find(([v]) => v === value)?.[1] ?? "All"
}
