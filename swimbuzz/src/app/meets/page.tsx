import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import LiveSearch from "@/components/LiveSearch"
import CreateMeetButton from "./CreateMeetButton"
import { isStaffUi } from "@/lib/athlete-view-server"
import { parseSeason, seasonEndYear } from "@/lib/season"
import MeetsClientWrapper from "./MeetsClientWrapper"

export default async function MeetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>
}) {
  const session = await getServerSession(authOptions)
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
          ],
      }
      : undefined,
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      location: true,
      startDate: true,
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
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      swims: { select: { athleteId: true } },
    },
  })

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

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-foreground">Meets</h1>
        <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-border bg-background p-1 text-sm border-border dark:bg-background">
                <Link
                    href={buildHref({ view: "gallery" })}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${activeView === "gallery" ? "bg-primary text-primary-text" : "text-foreground-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:text-foreground-secondary"}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                </Link>
                <Link
                    href={buildHref({ view: "list" })}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${activeView === "list" ? "bg-primary text-primary-text" : "text-foreground-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary"}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
                      <path d="M8 6h13" />
                      <path d="M8 12h13" />
                      <path d="M8 18h13" />
                      <path d="M3 6h.01" />
                      <path d="M3 12h.01" />
                      <path d="M3 18h.01" />
                    </svg>
                </Link>
            </div>
            {isCoach && <CreateMeetButton />}
        </div>
      </div>

      <Suspense fallback={null}>
        <LiveSearch pathname="/meets" placeholder="Search meets by name, school, or location…" />
      </Suspense>

      <MeetsClientWrapper
        meets={meets}
        bySeason={Object.fromEntries(bySeason)}
        seasons={seasons}
        isCoach={isCoach}
        query={query}
        view={activeView}
      />
    </main>
  )
}
