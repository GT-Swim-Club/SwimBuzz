import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import ImportRosterButton from "./ImportRosterButton"
import SyncTimesButton from "./SyncTimesButton"
import AddAthleteButton from "./AddAthleteButton"
import RosterView from "./RosterView"
import RosterSkeleton from "./RosterSkeleton"
import { parseSeason, resolveListedSeason } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { getSession } from "@/lib/auth/session"
import { readListLayout } from "@/lib/list-layout-server"
import { ListLayoutProvider } from "@/components/ui/ListLayout"
import PinSearchParams from "@/components/ui/PinSearchParams"
import type { ListLayout } from "@/lib/list-layout"

export const dynamic = 'force-dynamic'

type RosterSearchParams = { gender?: string; season?: string; year?: string; q?: string }

async function RosterContent({ searchParams, layout }: { searchParams: Promise<RosterSearchParams>; layout: ListLayout }) {
    const { season: seasonParam, year: legacyYear } = await searchParams

    const [seasons, session] = await Promise.all([
        listSeasons(),
        getSession(),
    ])
    if (!session) redirect("/signin")

    const season = resolveListedSeason(parseSeason(seasonParam ?? legacyYear), seasons)

    // Every gender for the season: RosterView filters gender and search client-side.
    const [athletes, viewerAthleteId, isCoach] = await Promise.all([
      prisma.athlete.findMany({
        where: { seasons: { has: season } },
        select: {
          id: true,
          slug: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          gender: true,
          year: true,
          dob: true,
          user: { select: { image: true, staffTitle: true } }},
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]}),
      resolveViewerAthleteId(session.user.id),
      isStaffUi(session.user.role),
    ])

    return (
        <ListLayoutProvider page="roster" initial={layout}>
            {/* Pin the resolved season in place rather than redirect()ing, which
                would flash the skeleton a second time. */}
            <PinSearchParams params={{ season, year: null }} />
            <RosterView
                athletes={athletes}
                seasons={seasons}
                season={season}
                viewerAthleteId={viewerAthleteId}
                actions={
                    isCoach ? (
                        <>
                            <ImportRosterButton />
                            <SyncTimesButton />
                            <AddAthleteButton />
                        </>
                    ) : null
                }
            />
        </ListLayoutProvider>
    )
}

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
