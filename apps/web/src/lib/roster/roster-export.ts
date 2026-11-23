import { prisma } from "@/lib/prisma"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { clearanceSummary, clearanceSummarySelect } from "@/lib/athlete/athlete-clearance"
import { parseSeason } from "@/lib/season"
import {
  matchesRosterFilters,
  matchesRosterSearch,
  readRosterFilters,
  type RosterFilters,
} from "@/lib/roster/roster-filters"

/**
 * What a roster export (PDF, CSV) covers, read from its query string the way the roster page
 * shows it: `season` (else every season), `gender`, the search `q`, and — for staff — the
 * `clearance` and `swimcloud` filters.
 */
export type RosterExportScope = {
  season: string | null
  staff: boolean
  filters: RosterFilters
  query: string
}

export async function readRosterExportScope(
  params: URLSearchParams,
  role: string
): Promise<RosterExportScope | { error: string }> {
  const rawSeason = params.get("season")
  const season = rawSeason ? parseSeason(rawSeason) : null
  if (rawSeason && !season) return { error: "Invalid season" }
  const staff = await isStaffUi(role)
  return {
    season,
    staff,
    filters: readRosterFilters(params, staff),
    query: params.get("q")?.trim() ?? "",
  }
}

/** The athletes in `scope`, by last then first name. Email and GTID are only read for staff. */
export async function loadRosterExportAthletes(scope: RosterExportScope) {
  const rows = await prisma.athlete.findMany({
    where: scope.season ? { seasons: { has: scope.season } } : undefined,
    select: {
      firstName: true,
      lastName: true,
      preferredName: true,
      gender: true,
      year: true,
      yearBySeason: true,
      seasons: true,
      dob: true,
      swimCloudIds: true,
      timesSyncedAt: true,
      gtid: scope.staff,
      user: { select: { email: scope.staff } },
      clearance: { select: clearanceSummarySelect },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  return rows
    .map((a) => ({
      ...a,
      gtid: scope.staff ? (a.gtid ?? null) : null,
      email: scope.staff ? (a.user?.email ?? null) : null,
      clearance: clearanceSummary(a.clearance),
    }))
    .filter((a) => matchesRosterFilters(a, scope.filters) && matchesRosterSearch(a, scope.query))
}

export type RosterExportAthlete = Awaited<ReturnType<typeof loadRosterExportAthletes>>[number]
