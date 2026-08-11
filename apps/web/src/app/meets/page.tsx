import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import LiveSearch from "@/components/LiveSearch"
import {
  GalleryListViewToggle,
  ViewNavPanel,
  ViewNavigationProvider } from "@/components/ViewNavigation"
import CreateMeetButton from "./CreateMeetButton"
import { isStaffUi } from "@/lib/athlete-view-server"
import { parseSeason, seasonEndYear } from "@/lib/season"
import MeetsClientWrapper from "./MeetsClientWrapper"
import { getSession } from "@/lib/session"

export default async function MeetsPage({
  searchParams}: {
  searchParams: Promise<{ q?: string; view?: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/signin")

  const isCoach = await isStaffUi(session.user.role)
  const { q, view } = await searchParams
  const query = q?.trim() ?? ""
  const activeView = view === "list" ? "list" : "gallery"
  
  function buildHref(next: { view?: "gallery" | "list" }) {
    const params = new URLSearchParams()
    if (query) params.set("q", query)
    const v = next.view ?? activeView
    if (v === "list") params.set("view", "list")
    const s = params.toString()
    return s ? `/meets?${s}` : "/meets"
  }

  const meetsRaw = await prisma.meet.findMany({
    where: query
      ?       {
        OR: [
            { name: { contains: query, mode: "insensitive" } },
            { location: { contains: query, mode: "insensitive" } },
            { school: { contains: query, mode: "insensitive" } },
          ]}
      : undefined,
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      location: true,
      startDate: true,
      startTime: true,
      endDate: true,
      course: true,
      season: true,
      school: true,
      iconUrl: true,
      bannerUrl: true,
      packetUrl: true,
      psychSheetUrl: true,
      heatSheetUrl: true,
      resultsUrl: true,
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      swims: { select: { athleteId: true } }}})

  // Normalize data for client...
  const meets = meetsRaw.map(m => ({ ...m, startDate: m.startDate, endDate: m.endDate, swims: m.swims }))

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

  const meetsLinkClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${
      active
        ? "bg-primary text-primary-text"
        : "text-foreground-secondary hover:bg-fill"
    }`

  return (
    <ViewNavigationProvider>
      <main className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-foreground">Meets</h1>
          <div className="flex items-center gap-3">
            <GalleryListViewToggle
              activeView={activeView}
              galleryHref={buildHref({ view: "gallery" })}
              listHref={buildHref({ view: "list" })}
              galleryLinkClassName={meetsLinkClass(activeView === "gallery")}
              listLinkClassName={meetsLinkClass(activeView === "list")}
            />
            {isCoach && <CreateMeetButton seasons={seasons} />}
          </div>
        </div>

        <Suspense fallback={null}>
          <LiveSearch pathname="/meets" placeholder="Search meets by name, school, or location…" />
        </Suspense>

        <ViewNavPanel>
          <MeetsClientWrapper
            meets={meets}
            bySeason={Object.fromEntries(bySeason)}
            seasons={seasons}
            isCoach={isCoach}
            query={query}
            view={activeView}
          />
        </ViewNavPanel>
      </main>
    </ViewNavigationProvider>
  )
}
