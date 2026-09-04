import BackLink from "@/components/ui/BackLink"
import { Gender } from "@prisma/client"
import { notFound, redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import {
  isResultStatusesSummary,
  meetHasImportedResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"
import {
  isRelaySignupEvent,
  partitionSignupEvents,
  resolveSignupEventOptions,
} from "@/lib/meet/meet-signup"
import { relaySignupKey } from "@/lib/swim/swim-parse"
import { athletePreferredName } from "@swimbuzz/shared"
import MeetRelayBuilder from "../MeetRelayBuilder"

export default async function MeetRelayBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/signin?callbackUrl=/meets/${encodeURIComponent(param)}/relays`)
  }
  if (!(await isStaffUi(session.user.role))) {
    redirect(`/meets/${encodeURIComponent(param)}`)
  }

  const meet = await prisma.meet.findFirst({
    where: { OR: [{ id: param }, { slug: param }] },
    select: {
      id: true,
      slug: true,
      name: true,
      season: true,
      course: true,
      createdAt: true,
      startsAt: true,
      endsAt: true,
      eventOrder: true,
      resultStatusesSummary: true,
      relayResultsSummary: true,
      swims: { select: { id: true } },
      signupForm: { select: { entries: { select: { athleteId: true, events: true } } } },
    },
  })
  if (!meet) notFound()

  const meetPath = `/meets/${meet.slug ?? meet.id}`
  if (meet.slug && param !== meet.slug) redirect(`${meetPath}/relays`)

  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const lastActiveDate = new Date(meet.endsAt ?? meet.startsAt ?? meet.createdAt)
  lastActiveDate.setHours(0, 0, 0, 0)
  if (lastActiveDate <= yesterday) redirect(meetPath)

  const seasonRoster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, nicknames: true, gender: true },
  })

  const signupAthleteIds: string[] = []
  const signupAthleteIdsByEvent: Record<string, string[]> = {}
  const signupIndividualCount: Record<string, number> = {}
  for (const entry of meet.signupForm?.entries ?? []) {
    if (!signupAthleteIds.includes(entry.athleteId)) {
      signupAthleteIds.push(entry.athleteId)
    }
    signupIndividualCount[entry.athleteId] = partitionSignupEvents(
      entry.events
    ).individual.length
    for (const event of entry.events) {
      if (!isRelaySignupEvent(event)) continue
      const key = relaySignupKey(event)
      if (!key) continue
      if (!signupAthleteIdsByEvent[key]) signupAthleteIdsByEvent[key] = []
      if (!signupAthleteIdsByEvent[key].includes(entry.athleteId)) {
        signupAthleteIdsByEvent[key].push(entry.athleteId)
      }
    }
  }

  const athletes = seasonRoster.map((athlete) => ({
    id: athlete.id,
    name: athletePreferredName(athlete),
    gender: athlete.gender === Gender.F ? ("F" as const) : ("M" as const),
    signupEvents: signupIndividualCount[athlete.id] ?? 0,
  }))

  const relayEvents = resolveSignupEventOptions(meet.eventOrder)
    .filter((option) => option.isRelay)
    .map((option) => option.event)
  const hasImportedResults = meetHasImportedResults({
    swimCount: meet.swims.length,
    resultStatusEntries: isResultStatusesSummary(meet.resultStatusesSummary)
      ? meet.resultStatusesSummary.entries
      : [],
    relayResults: isRelayResultsSummary(meet.relayResultsSummary)
      ? meet.relayResultsSummary.entries
      : [],
  })

  return (
    <main className="mx-auto w-full max-w-[44rem] flex flex-col gap-6 py-2 sm:py-4">
      <BackLink
        fallbackHref={meetPath}
        fallbackLabel={meet.name}
        className="self-start -mb-5 inline-flex items-center gap-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
      />
      <header>
        <h1 className="text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
          {meet.name}
        </h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Relay builder
        </p>
      </header>
      <MeetRelayBuilder
        meetId={meet.id}
        defaultCourse={meet.course}
        relayEvents={relayEvents}
        athletes={athletes}
        signupAthleteIds={signupAthleteIds}
        signupAthleteIdsByEvent={signupAthleteIdsByEvent}
        hasImportedResults={hasImportedResults}
      />
    </main>
  )
}
