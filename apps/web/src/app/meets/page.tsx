import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { zonedDayKey } from "@swimbuzz/shared"
import CreateMeetButton from "./CreateMeetButton"
import MeetsViewSwitch from "./MeetsViewSwitch"
import MeetsToolbarSelects from "./MeetsToolbarSelects"
import MeetsToolbar from "./MeetsToolbar"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { parseSeason } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import MeetsClientWrapper from "./MeetsClientWrapper"
import MeetsListSkeleton, { MeetsToolbarSkeleton } from "./MeetsListSkeleton"
import { getSession } from "@/lib/auth/session"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"
import { readListLayout } from "@/lib/list-layout-server"
import { MeetsLayoutProvider } from "./use-meets-layout"

// Seasons come from the canonical Season table, matching how /athletes and
// meets/[id] source their season lists — independent of the meets list stream.
async function ToolbarControlsSection({ isCoach, showScope }: { isCoach: boolean; showScope: boolean }) {
  const seasons = await listSeasons()
  // No wrapper: MeetsToolbar lays these out (and measures them) directly.
  return (
    <MeetsToolbarSelects seasons={seasons} showTrash={isCoach} showScope={showScope}>
      {isCoach && <CreateMeetButton seasons={seasons} />}
    </MeetsToolbarSelects>
  )
}

async function MeetsListSection({
  query,
  isCoach,
  viewerAthleteId,
}: {
  query: string
  isCoach: boolean
  viewerAthleteId: string | null
}) {
  // Edit dropdowns need every canonical season, not just the ones grouping the
  // (possibly search-filtered) list below.
  const [meetsRaw, seasonOptions, swamMeets] = await Promise.all([
    prisma.meet.findMany({
      where: query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { location: { contains: query, mode: "insensitive" } },
              { school: { contains: query, mode: "insensitive" } },
            ],
          }
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
        // Only for `hasSwims` (the delete dialog's options), not sent to the client.
        relayResultsSummary: true,
        _count: { select: { swims: true } },
      },
    }),
    listSeasons(),
    viewerAthleteId
      ? prisma.swim.findMany({
          where: { athleteId: viewerAthleteId, meetId: { not: null } },
          distinct: ["meetId"],
          select: { meetId: true },
        })
      : [],
  ])

  const myMeetIds = new Set<string>(swamMeets.flatMap((s) => (s.meetId ? [s.meetId] : [])))
  const now = new Date()

  const meets = meetsRaw.map(({ relayResultsSummary, _count, ...meet }) => ({
    ...meet,
    // Same rule as the meet page: individual swims or imported relay results.
    hasSwims:
      _count.swims > 0 ||
      (isRelayResultsSummary(relayResultsSummary) && relayResultsSummary.entries.length > 0),
    season: parseSeason(meet.season) ?? meet.season,
    // A meet stays "upcoming" through its last day in its own zone, so a
    // multi-day meet in progress isn't filed under past results yet.
    upcoming: zonedDayKey(meet.endsAt ?? meet.startsAt, meet.timeZone) >= zonedDayKey(now, meet.timeZone),
    mine: myMeetIds.has(meet.id),
  }))

  return (
    <MeetsClientWrapper
      meets={meets}
      seasonOptions={seasonOptions}
      isCoach={isCoach}
      query={query}
      canScope={!!viewerAthleteId}
    />
  )
}

export default async function MeetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await getSession()
  if (!session) redirect("/signin")

  const [isCoach, viewerAthleteId, layout] = await Promise.all([
    isStaffUi(session.user.role),
    resolveViewerAthleteId(session.user.id),
    readListLayout("meets"),
  ])
  // Only the search query is read server-side (it narrows the DB query).
  // Season / scope / Trash are applied client-side from the URL so switching
  // them is instant — see useMeetsFilters.
  const query = (await searchParams).q?.trim() ?? ""

  return (
    <main className="flex flex-col gap-6">
      <h1 className="sr-only">Meets</h1>
      {/* One boundary so the toolbar and the cards appear together. Searches
          navigate in a transition, so they keep this content up instead of
          falling back to the skeleton. */}
      <Suspense
        fallback={
          <>
            <MeetsToolbarSkeleton />
            <MeetsListSkeleton layout={layout} />
          </>
        }
      >
        <MeetsLayoutProvider initial={layout}>
          <MeetsToolbar controls={<ToolbarControlsSection isCoach={isCoach} showScope={!!viewerAthleteId} />} />

          <MeetsViewSwitch showTrash={isCoach}>
            <MeetsListSection query={query} isCoach={isCoach} viewerAthleteId={viewerAthleteId} />
          </MeetsViewSwitch>
        </MeetsLayoutProvider>
      </Suspense>
    </main>
  )
}
