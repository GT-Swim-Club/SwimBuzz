import { Suspense } from "react"
import { clearanceSummary, clearanceSummarySelect } from "@/lib/athlete/athlete-clearance"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import RosterAddMenu from "./RosterAddMenu"
import RosterView from "./RosterView"
import RosterSkeleton from "./RosterSkeleton"
import { currentSeason, parseSeason, resolveListedSeason } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { getSession } from "@/lib/auth/session"
import { readListLayout } from "@/lib/list-layout-server"
import { ListLayoutProvider } from "@/components/ui/ListLayout"
import PinSearchParams from "@/components/ui/PinSearchParams"
import type { ListLayout } from "@/lib/list-layout"
import { athleteYearForSeason } from "@swimbuzz/shared"
import { ALL_SEASONS } from "@/lib/roster/roster-filters"

export const dynamic = 'force-dynamic'

type RosterSearchParams = { gender?: string; season?: string; year?: string; q?: string }

async function RosterContent({ searchParams, layout }: { searchParams: Promise<RosterSearchParams>; layout: ListLayout }) {
    const { season: seasonParam, year: legacyYear } = await searchParams

    const [seasons, session] = await Promise.all([
        listSeasons(),
        getSession(),
    ])
    if (!session) redirect("/signin")

    // `season=all` lists every athlete (like the roster PDF/CSV with no season); otherwise one season.
    const season =
      seasonParam === ALL_SEASONS ? null : resolveListedSeason(parseSeason(seasonParam ?? legacyYear), seasons)

    // Every gender for the season: RosterView filters gender and search client-side.
    const [rows, viewerAthleteId, isCoach] = await Promise.all([
      prisma.athlete.findMany({
        where: season ? { seasons: { has: season } } : undefined,
        select: {
          id: true,
          slug: true,
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
          clearance: { select: clearanceSummarySelect },
          user: { select: { image: true, staffTitle: true } }},
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]}),
      resolveViewerAthleteId(session.user.id),
      isStaffUi(session.user.role),
    ])

    // The year each athlete was in the season on screen, not their latest (latest for all seasons).
    const athletes = rows.map(({ yearBySeason, seasons: athleteSeasons, clearance, ...athlete }) => ({
      ...athlete,
      // Clearance & SwimCloud status icons: staff see everyone's, an athlete only their own.
      clearance: isCoach || athlete.id === viewerAthleteId ? clearanceSummary(clearance) : null,
      year: season
        ? athleteYearForSeason({ yearBySeason, year: athlete.year, seasons: athleteSeasons }, season)
        : athlete.year,
    }))

    return (
        <ListLayoutProvider page="roster" initial={layout}>
            {/* Pin the resolved season in place rather than redirect()ing, which
                would flash the skeleton a second time. */}
            <PinSearchParams params={{ season: season ?? ALL_SEASONS, year: null }} />
            <RosterView
                athletes={athletes}
                seasons={seasons}
                season={season}
                viewerAthleteId={viewerAthleteId}
                showStatus={isCoach}
                actions={
                    // Imports target one season: the current one while viewing all seasons.
                    isCoach ? <RosterAddMenu season={season ?? currentSeason()} /> : null
                }
            />
        </ListLayoutProvider>
    )
}

export const metadata = { title: "Roster" }

export default async function AthletesPage(props: {
    searchParams: Promise<RosterSearchParams>
  }) {
    const layout = await readListLayout("roster")
    return (
        <main className="flex flex-col gap-6">
            <h1 className="sr-only">Roster</h1>
            <Suspense fallback={<RosterSkeleton layout={layout} />}>
                <RosterContent searchParams={props.searchParams} layout={layout} />
            </Suspense>
        </main>
    )
}
