import LoadingComponent from "./loading"
import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import ImportRosterButton from "./ImportRosterButton"
import SyncTimesButton from "./SyncTimesButton"
import AddAthleteButton from "./AddAthleteButton"
import AthletesClientWrapper from "./AthletesClientWrapper"
import RosterFilters, { RosterSearch } from "./RosterFilters"
import { currentSeason, parseSeason } from "@/lib/season"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete-view-server"
import Link from "next/link"

export const dynamic = 'force-dynamic'

function matchesAthleteQuery(
    athlete: { firstName: string; lastName: string; nicknames: string[] },
    query: string
  ) {
    const q = query.toLowerCase()
    const haystack = [
      athlete.firstName,
      athlete.lastName,
      `${athlete.firstName} ${athlete.lastName}`,
      `${athlete.lastName}, ${athlete.firstName}`,
      ...athlete.nicknames,
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  }

async function RosterContent({ searchParams }: { searchParams: Promise<{ gender?: string; season?: string; year?: string; q?: string; view?: string }> }) {
    const { gender, season: seasonParam, year: legacyYear, q, view } = await searchParams
    const query = q?.trim() ?? ""
    const activeView = view === "list" ? "list" : "gallery"

    const season =
      parseSeason(seasonParam ?? legacyYear) ?? currentSeason()

    if (!gender || (!seasonParam && !legacyYear)) {
        const params = new URLSearchParams({
          gender: gender ?? "all",
          season,
        })
        if (query) params.set("q", query)
        if (view) params.set("view", view)
        redirect(`/athletes?${params.toString()}`)
    }

    const session = await getServerSession(authOptions)
    if (!session) redirect("/signin")

    const genderFilter =
      gender === "F" ? "F" : gender === "M" ? "M" : null
  
    const athletes = await prisma.athlete.findMany({
        where: {
          ...(genderFilter ? { gender: genderFilter } : {}),
          seasons: { has: season },
        },
      include: {
        user: { select: { name: true, email: true, image: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    })

    const filteredAthletes = query
      ? athletes.filter((a) => matchesAthleteQuery(a, query))
      : athletes

    const viewerAthleteId = await resolveViewerAthleteId(session.user.id, session.user.role)
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
            season,
        })
        if (query) params.set("q", query)
        const v = next.view ?? activeView
        if (v === "list") params.set("view", "list")
        return `/athletes?${params.toString()}`
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-3xl font-semibold text-foreground">Roster</h1>
                    <RosterFilters count={sortedAthletes.length} />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="inline-flex rounded-lg border border-border bg-background p-1 text-sm">
                        <Link
                            href={buildHref({ view: "gallery" })}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${activeView === "gallery" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:border-border hover:bg-fill-secondary"}`}
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
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 transition-colors ${activeView === "list" ? "bg-primary text-primary-text" : "text-foreground-secondary hover:border-border hover:bg-fill-secondary"}`}
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

            <AthletesClientWrapper
            athletes={sortedAthletes}
            viewerAthleteId={viewerAthleteId}
            showGender={showGender}
            query={query}
            view={activeView}
            />
        </div>
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
