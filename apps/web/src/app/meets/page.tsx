import Link from "next/link"
import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import LiveSearch from "@/components/ui/LiveSearch"
import { Skeleton } from "@/components/ui/Skeleton"
import {
  GalleryListViewToggle,
  ViewNavPanel,
  ViewNavigationProvider } from "@/components/nav/ViewNavigation"
import CreateMeetButton from "./CreateMeetButton"
import DeletedMeetsList from "./DeletedMeetsList"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { parseSeason, seasonEndYear } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import MeetsClientWrapper from "./MeetsClientWrapper"
import { getSession } from "@/lib/auth/session"
import { countMeetAthletes } from "@/lib/meet/meet-sheet-summary"

function MeetsListSkeleton() {
  return (
    <div className="space-y-8">
      {[...Array(2)].map((_, i) => (
        <section key={i} className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, j) => (
              <Skeleton key={j} className="h-48 w-full" />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// Independent of the meets list so the create-button season dropdown doesn't
// block (or get blocked by) the list stream — it's the canonical Season
// table, matching how /athletes and meets/[id] source their season lists.
async function CreateMeetButtonSection() {
  const seasons = await listSeasons()
  return <CreateMeetButton seasons={seasons} />
}

async function MeetsListSection({
  query,
  activeView,
  isCoach,
}: {
  query: string
  activeView: "gallery" | "list"
  isCoach: boolean
}) {
  const meetsRaw = await prisma.meet.findMany({
    where: query
      ?       {
        OR: [
            { name: { contains: query, mode: "insensitive" } },
            { location: { contains: query, mode: "insensitive" } },
            { school: { contains: query, mode: "insensitive" } },
          ]}
      : undefined,
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      location: true,
      startsAt: true,
      endsAt: true,
      hasStartTime: true,
      timeZone: true,
      course: true,
      season: true,
      school: true,
      iconUrl: true,
      bannerUrl: true,
      packetUrl: true,
      psychSheetUrl: true,
      heatSheetUrl: true,
      resultsUrl: true,
      // Selected only to compute athleteCount below — stripped before the
      // meet objects are handed to the client component so this heavy JSON
      // never travels the RSC payload (was previously serialized twice, for
      // both `meets` and `bySeason`).
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true}})

  const meetIds = meetsRaw.map((m) => m.id)
  // Grouped query instead of fetching every swim row: one row per
  // (meet, athlete) pair regardless of how many events that athlete swam.
  const swimAthleteRows = meetIds.length
    ? await prisma.swim.groupBy({
        by: ["meetId", "athleteId"],
        where: { meetId: { in: meetIds } }})
    : []
  const swimAthleteIdsByMeet = new Map<string, string[]>()
  for (const row of swimAthleteRows) {
    if (!row.meetId) continue
    const list = swimAthleteIdsByMeet.get(row.meetId)
    if (list) list.push(row.athleteId)
    else swimAthleteIdsByMeet.set(row.meetId, [row.athleteId])
  }

  const meets = meetsRaw.map(({
    psychSheetSummary,
    heatSheetSummary,
    finalsHeatSheetSummary,
    entriesSheetSummary,
    relayResultsSummary,
    resultStatusesSummary,
    ...meet
  }) => ({
    ...meet,
    athleteCount: countMeetAthletes({
      psychSheetSummary,
      heatSheetSummary,
      finalsHeatSheetSummary,
      entriesSheetSummary,
      relayResultsSummary,
      resultStatusesSummary,
      swimAthleteIds: swimAthleteIdsByMeet.get(meet.id) ?? []})}))

  const bySeason = new Map<string, typeof meets>()
  for (const meet of meets) {
    const season = parseSeason(meet.season) ?? meet.season
    const group = bySeason.get(season)
    if (group) group.push(meet)
    else bySeason.set(season, [meet])
  }

  const seasons = [...bySeason.keys()].sort((a, b) => {
    const aParsed = parseSeason(a)
    const bParsed = parseSeason(b)
    if (aParsed && bParsed) return seasonEndYear(bParsed) - seasonEndYear(aParsed)
    if (aParsed) return -1
    if (bParsed) return 1
    return b.localeCompare(a)
  })

  return (
    <MeetsClientWrapper
      meets={meets}
      bySeason={Object.fromEntries(bySeason)}
      seasons={seasons}
      isCoach={isCoach}
      query={query}
      view={activeView}
    />
  )
}

export default async function MeetsPage({
  searchParams}: {
  searchParams: Promise<{ q?: string; view?: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/signin")

  const isCoach = await isStaffUi(session.user.role)
  const { q, view } = await searchParams
  const query = q?.trim() ?? ""
  const activeView = view === "list" ? "list" : view === "deleted" && isCoach ? "deleted" : "gallery"

  function buildHref(next: { view?: "gallery" | "list" | "deleted" }) {
    const params = new URLSearchParams()
    if (query) params.set("q", query)
    const v = next.view ?? activeView
    if (v !== "gallery") params.set("view", v)
    const s = params.toString()
    return s ? `/meets?${s}` : "/meets"
  }

  return (
    <ViewNavigationProvider>
      <main className="space-y-6">
        <h1 className="sr-only">Meets</h1>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-3">
            <GalleryListViewToggle
              activeView={activeView === "deleted" ? "gallery" : activeView}
              galleryHref={buildHref({ view: "gallery" })}
              listHref={buildHref({ view: "list" })}
            />
            {isCoach && (
              <Link
                href={buildHref({ view: "deleted" })}
                aria-label="Trash"
                className={
                  "group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors " +
                  (activeView === "deleted"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border-secondary bg-background text-foreground-secondary hover:bg-fill-secondary hover:text-foreground")
                }
              >
                <AppIcon name="trash" className="h-4 w-4" />
                <HoverDetail label="Trash" />
              </Link>
            )}
            {isCoach && activeView !== "deleted" && (
              <Suspense fallback={<Skeleton className="h-9 w-24" />}>
                <CreateMeetButtonSection />
              </Suspense>
            )}
          </div>
        </div>

        {activeView === "deleted" ? (
          <DeletedMeetsList />
        ) : (
          <>
            <Suspense fallback={null}>
              <LiveSearch pathname="/meets" placeholder="Search meets by name, school, or location…" />
            </Suspense>

            <ViewNavPanel>
              <Suspense fallback={<MeetsListSkeleton />}>
                <MeetsListSection query={query} activeView={activeView} isCoach={isCoach} />
              </Suspense>
            </ViewNavPanel>
          </>
        )}
      </main>
    </ViewNavigationProvider>
  )
}
