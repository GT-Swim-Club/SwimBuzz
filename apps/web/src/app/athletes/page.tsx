import LoadingComponent from "./loading"
import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import ImportRosterButton from "./ImportRosterButton"
import SyncTimesButton from "./SyncTimesButton"
import AddAthleteButton from "./AddAthleteButton"
import AthletesClientWrapper from "./AthletesClientWrapper"
import RosterFilters from "./RosterFilters"
import { parseSeason, resolveListedSeason } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { getSession } from "@/lib/auth/session"
import {
  GalleryListViewToggle,
  ViewNavPanel,
  ViewNavigationProvider } from "@/components/nav/ViewNavigation"

export const dynamic = 'force-dynamic'

async function RosterContent({ searchParams }: { searchParams: Promise<{ gender?: string; season?: string; year?: string; view?: string }> }) {
    const { gender, season: seasonParam, year: legacyYear, view } = await searchParams

    const [seasons, session] = await Promise.all([
        listSeasons(),
        getSession(),
    ])
    if (!session) redirect("/signin")

    const requestedSeason = parseSeason(seasonParam ?? legacyYear)
    const season = resolveListedSeason(requestedSeason, seasons)

    if (!gender || requestedSeason !== season) {
        const params = new URLSearchParams({
          gender: gender ?? "all",
          season})
        if (view) params.set("view", view)
        redirect(`/athletes?${params.toString()}`)
    }

    const genderFilter =
      gender === "F" ? "F" : gender === "M" ? "M" : null

    const [user, athletes, viewerAthleteId, isCoach] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id }, select: { defaultView: true } }),
      prisma.athlete.findMany({
        where: {
          ...(genderFilter ? { gender: genderFilter } : {}),
          seasons: { has: season }},
        include: {
          user: { select: { name: true, email: true, image: true, staffTitle: true } }},
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]}),
      resolveViewerAthleteId(session.user.id),
      isStaffUi(session.user.role),
    ])

    const defaultView = user?.defaultView ?? "gallery"
    const activeView = view ? (view === "list" ? "list" : "gallery") : (defaultView === "list" ? "list" : "gallery")

    const sortedAthletes =
      viewerAthleteId && athletes.some((a) => a.id === viewerAthleteId)
        ? [
            ...athletes.filter((a) => a.id === viewerAthleteId),
            ...athletes.filter((a) => a.id !== viewerAthleteId),
          ]
        : athletes

    const showGender = genderFilter == null

    function buildHref(next: { view?: "gallery" | "list" }) {
        const params = new URLSearchParams({
            gender: gender ?? "all",
            season})
        const v = next.view ?? activeView
        if (v !== defaultView) params.set("view", v)
        return `/athletes?${params.toString()}`
    }

    return (
        <ViewNavigationProvider>
            <div className="space-y-6">
                <h1 className="sr-only">Roster</h1>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                        <RosterFilters seasons={seasons} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <GalleryListViewToggle
                            activeView={activeView}
                            galleryHref={buildHref({ view: "gallery" })}
                            listHref={buildHref({ view: "list" })}
                        />
                    {isCoach && (
                        <div className="flex items-center gap-3 flex-wrap">
                            <ImportRosterButton />
                            <SyncTimesButton />
                            <AddAthleteButton />
                        </div>
                    )}
                    </div>
                </div>

                <ViewNavPanel>
                    <AthletesClientWrapper
                    athletes={sortedAthletes}
                    viewerAthleteId={viewerAthleteId}
                    showGender={showGender}
                    view={activeView}
                    />
                </ViewNavPanel>
            </div>
        </ViewNavigationProvider>
    )
}

export default async function AthletesPage(props: {
    searchParams: Promise<{ gender?: string; season?: string; year?: string; view?: string }>
  }) {
    return (
        <main className="space-y-6">
            <Suspense fallback={<LoadingComponent />}>
                <RosterContent {...props} />
            </Suspense>
        </main>
    )
}
