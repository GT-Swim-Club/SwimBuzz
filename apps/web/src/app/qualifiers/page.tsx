import { Suspense } from "react"
import { redirect } from "next/navigation"
import { parseSeason, resolveListedSeason } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import { computeNationalsQualifiers } from "@/lib/qualifiers/nationals-qualifiers"
import { compareSwimEvents } from "@/lib/swim/swim-parse"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { getSession } from "@/lib/auth/session"
import { readListLayout } from "@/lib/list-layout-server"
import { ListLayoutProvider } from "@/components/ui/ListLayout"
import QualifiersView from "./QualifiersView"
import QualifiersSkeleton from "./QualifiersSkeleton"

export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>

async function QualifiersContent({
  season,
  userId,
  role,
}: {
  season: string
  userId: string
  role: string
}) {
  const [isCoach, currentAthleteId, { set, qualifiers }, seasons] = await Promise.all([
    isStaffUi(role),
    resolveViewerAthleteId(userId),
    // Every gender: the gender filter, grouping and search apply client-side
    // from the URL (see QualifiersView), so switching them is instant.
    computeNationalsQualifiers({ season }),
    listSeasons(),
  ])

  // Rank events in swim order here — compareSwimEvents is server-only.
  const events = [...new Set(qualifiers.flatMap((athlete) => athlete.events.map((e) => e.event)))]
  const eventRank = Object.fromEntries(events.sort(compareSwimEvents).map((event, index) => [event, index]))

  return (
    <QualifiersView
      season={season}
      seasons={seasons}
      standards={set ? { yearLabel: set.yearLabel, sourceUrl: set.sourceUrl, course: set.course } : null}
      qualifiers={qualifiers}
      eventRank={eventRank}
      currentAthleteId={currentAthleteId}
      isCoach={isCoach}
    />
  )
}

export default async function QualifiersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession()
  if (!session) redirect("/signin")

  const params = await searchParams
  const seasonParam = typeof params.season === "string" ? params.season : undefined
  const [seasons, layout] = await Promise.all([listSeasons(), readListLayout("nationals")])
  const requestedSeason = parseSeason(seasonParam)
  const season = resolveListedSeason(requestedSeason, seasons)

  // Season is the only server-side filter; pin it in the URL so the season
  // dropdown, sharing and refresh all agree.
  if (!seasonParam || requestedSeason !== season) {
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "season") next.set(key, value)
    }
    next.set("season", season)
    redirect(`/qualifiers?${next.toString()}`)
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="sr-only">Nationals Qualifiers</h1>
      {/* One boundary so the toolbar and the list appear together. Season
          changes navigate in a transition, so they keep this content up
          instead of falling back to the skeleton. */}
      <Suspense fallback={<QualifiersSkeleton layout={layout} byEvent={params.group === "event"} />}>
        <ListLayoutProvider page="nationals" initial={layout}>
          <QualifiersContent season={season} userId={session.user.id} role={session.user.role} />
        </ListLayoutProvider>
      </Suspense>
    </main>
  )
}
