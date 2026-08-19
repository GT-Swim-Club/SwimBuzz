import LoadingComponent from "./loading"
import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import ImportRosterButton from "./ImportRosterButton"
import SyncTimesButton from "./SyncTimesButton"
import AddAthleteButton from "./AddAthleteButton"
import AthletesClientWrapper from "./AthletesClientWrapper"
import RosterFilters, { RosterSearch } from "./RosterFilters"
import { parseSeason, resolveListedSeason } from "@/lib/season"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete-view-server"
import { getSession } from "@/lib/session"
import {
  GalleryListViewToggle,
  ViewNavPanel,
  ViewNavigationProvider } from "@/components/ViewNavigation"

export const dynamic = 'force-dynamic'

async function RosterContent({ searchParams }: { searchParams: Promise<{ gender?: string; season?: string; year?: string; q?: string; view?: string }> }) {
    const { gender, season: seasonParam, year: legacyYear, q, view } = await searchParams
    const query = q?.trim() ?? ""

    const seasons = await prisma.season.findMany({
        orderBy: { label: "desc" }}).then(list => list.map(s => s.label))
    const requestedSeason = parseSeason(seasonParam ?? legacyYear)
    const season = resolveListedSeason(requestedSeason, seasons)

    if (!gender || requestedSeason !== season) {
        const params = new URLSearchParams({
          gender: gender ?? "all",
          season})
        if (query) params.set("q", query)
        if (view) params.set("view", view)
        redirect(`/athletes?${params.toString()}`)
    }

    const session = await getSession()
    if (!session) redirect("/signin")
    
    // Fetch user preference
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { defaultView: true } })
    const defaultView = user?.defaultView ?? "gallery"

    const activeView = view ? (view === "list" ? "list" : "gallery") : (defaultView === "list" ? "list" : "gallery")
    const genderFilter =
      gender === "F" ? "F" : gender === "M" ? "M" : null

    // Build a DB-level search filter so we only fetch matching rows instead of
    // loading the full roster and filtering in JS.
    // Note: Prisma cannot do substring search on String[] (nicknames), so we
    // filter first/last name in the DB and then post-filter nicknames in JS.
    const firstLastWhere = query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" as const } },
            { lastName: { contains: query, mode: "insensitive" as const } },
          ]}
      : {}

    const athletes = await prisma.athlete.findMany({
        where: {
          ...(genderFilter ? { gender: genderFilter } : {}),
          seasons: { has: season },
          ...firstLastWhere},
      include: {
        user: { select: { name: true, email: true, image: true, staffTitle: true } }},
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }]})

    // Post-filter: also match athletes whose nickname contains the query
    // (Prisma can't do substring search on array fields).
    const filteredAthletes = query
      ? athletes.filter((a) => {
          const q = query.toLowerCase()
          // firstName/lastName already matched by DB; re-check nicknames too
          return (
            a.firstName.toLowerCase().includes(q) ||
            a.lastName.toLowerCase().includes(q) ||
            a.nicknames.some((n) => n.toLowerCase().includes(q))
          )
        })
      : athletes

    const viewerAthleteId = await resolveViewerAthleteId(session.user.id)
    const sortedAthletes =
      viewerAthleteId && filteredAthletes.some((a) => a.id === viewerAthleteId)
        ? [
            ...filteredAthletes.filter((a) => a.id === viewerAthleteId),
            ...filteredAthletes.filter((a) => a.id !== viewerAthleteId),
          ]
        : filteredAthletes
  
    const isCoach = await isStaffUi(session.user.role)
    const showGender = genderFilter == null

    function buildHref(next: { view?: "gallery" | "list" }) {
        const params = new URLSearchParams({
            gender: gender ?? "all",
            season})
        if (query) params.set("q", query)
        const v = next.view ?? activeView
        if (v === "list") params.set("view", "list")
        return `/athletes?${params.toString()}`
    }

    return (
        <ViewNavigationProvider>
            <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="text-3xl font-semibold text-foreground">Roster</h1>
                        <RosterFilters count={sortedAthletes.length} seasons={seasons} />
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
                
                <RosterSearch />

                <ViewNavPanel>
                    <AthletesClientWrapper
                    athletes={sortedAthletes}
                    viewerAthleteId={viewerAthleteId}
                    showGender={showGender}
                    query={query}
                    view={activeView}
                    />
                </ViewNavPanel>
            </div>
        </ViewNavigationProvider>
    )
}

export default async function AthletesPage(props: {
    searchParams: Promise<{ gender?: string; season?: string; year?: string; q?: string; view?: string }>
  }) {
    return (
        <main className="space-y-6">
            <Suspense fallback={<LoadingComponent />}>
                <RosterContent {...props} />
            </Suspense>
        </main>
    )
}
