import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { zonedDayKey } from "@swimbuzz/shared"
import LiveSearch from "@/components/ui/LiveSearch"
import { Skeleton } from "@/components/ui/Skeleton"
import CreateMeetButton from "./CreateMeetButton"
import MeetsViewSwitch from "./MeetsViewSwitch"
import MeetsToolbarSelects from "./MeetsToolbarSelects"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { parseSeason } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import { signupWindowStatus } from "@/lib/meet/meet-signup"
import MeetsClientWrapper from "./MeetsClientWrapper"
import MeetsListSkeleton from "./MeetsListSkeleton"
import { getSession } from "@/lib/auth/session"

// Seasons come from the canonical Season table, matching how /athletes and
// meets/[id] source their season lists — independent of the meets list stream.
async function ToolbarControlsSection({ isCoach, showScope }: { isCoach: boolean; showScope: boolean }) {
  const seasons = await listSeasons()
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <MeetsToolbarSelects seasons={seasons} showTrash={isCoach} showScope={showScope}>
        {isCoach && <CreateMeetButton seasons={seasons} />}
      </MeetsToolbarSelects>
    </div>
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
  const [meetsRaw, seasonOptions, swamMeets, signedUpMeets] = await Promise.all([
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
        signupForm: { select: { openAt: true, closeAt: true } },
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
    viewerAthleteId
      ? prisma.meetSignupEntry.findMany({
          where: { athleteId: viewerAthleteId },
          select: { form: { select: { meetId: true } } },
        })
      : [],
  ])

  const myMeetIds = new Set<string>([
    ...swamMeets.flatMap((s) => (s.meetId ? [s.meetId] : [])),
    ...signedUpMeets.map((e) => e.form.meetId),
  ])
  const now = new Date()

  const meets = meetsRaw.map(({ signupForm, ...meet }) => ({
    ...meet,
    season: parseSeason(meet.season) ?? meet.season,
    // A meet stays "upcoming" through its last day in its own zone, so a
    // multi-day meet in progress isn't filed under past results yet.
    upcoming: zonedDayKey(meet.endsAt ?? meet.startsAt, meet.timeZone) >= zonedDayKey(now, meet.timeZone),
    signupOpen: !!signupForm && signupWindowStatus({ ...signupForm, now }).open,
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

  const [isCoach, viewerAthleteId] = await Promise.all([
    isStaffUi(session.user.role),
    resolveViewerAthleteId(session.user.id),
  ])
  // Only the search query is read server-side (it narrows the DB query).
  // Season / scope / Trash are applied client-side from the URL so switching
  // them is instant — see useMeetsFilters.
  const query = (await searchParams).q?.trim() ?? ""

  return (
    <main className="flex flex-col gap-6">
      <h1 className="sr-only">Meets</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<Skeleton className="h-[42px] min-w-[200px] flex-1 rounded-lg" />}>
          <LiveSearch
            pathname="/meets"
            placeholder="Search meets by name, school, or location…"
            className="h-[42px] min-w-[200px] flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-foreground-tertiary"
          />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[42px] w-64 rounded-lg" />}>
          <ToolbarControlsSection isCoach={isCoach} showScope={!!viewerAthleteId} />
        </Suspense>
      </div>

      <Suspense fallback={<MeetsListSkeleton />}>
        <MeetsViewSwitch showTrash={isCoach}>
          <MeetsListSection query={query} isCoach={isCoach} viewerAthleteId={viewerAthleteId} />
        </MeetsViewSwitch>
      </Suspense>
    </main>
  )
}
