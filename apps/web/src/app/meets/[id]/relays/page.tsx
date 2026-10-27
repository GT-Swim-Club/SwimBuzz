import BackLink from "@/components/ui/BackLink"
import { Gender } from "@prisma/client"
import { notFound, redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import {
  isResultStatusesSummary,
  meetHasImportedResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"
import { resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import { isSignupRelayPreferences } from "@/lib/meet/meet-signup-import"
import { isMeetFinalRoster } from "@/lib/meet/meet-roster-import"
import { buildRelayLineups } from "@/lib/meet/relay-lineups"
import { relayDraftsOf } from "@/lib/meet/relay-drafts"
import { deleteEndedMeetRelayDrafts } from "@/lib/meet/relay-drafts-expiry"
import {
  FALLBACK_RELAY_EVENTS,
  relayEventSlots,
  slotMatches,
  type RelaySlotData,
} from "@/lib/meet/relay-builder"
import { athletePreferredName } from "@swimbuzz/shared"
import MeetRelaysWorkspace from "./MeetRelaysWorkspace"
import RelayPageHeader, { relayBackLinkClass, relayEyebrowClass } from "./RelayPageHeader"
import RelaySummary, { publishedSummaryCards, relayShareEvent } from "./RelaySummary"
import ShareRelaysButton from "./ShareRelaysButton"

export default async function MeetRelaysPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // The open event (`?event=`) is read on the client, so switching events needs no server render.
  const { id: param } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/signin?callbackUrl=/meets/${encodeURIComponent(param)}/relays`)
  }
  const [isStaff, viewerAthleteId] = await Promise.all([
    isStaffUi(session.user.role),
    resolveViewerAthleteId(session.user.id),
  ])

  const meet = await prisma.meet.findFirst({
    where: { OR: [{ id: param }, { slug: param }] },
    select: {
      id: true,
      slug: true,
      name: true,
      iconUrl: true,
      season: true,
      course: true,
      createdAt: true,
      startsAt: true,
      endsAt: true,
      eventOrder: true,
      resultStatusesSummary: true,
      relayResultsSummary: true,
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
      signupRelayPreferences: true,
      finalRoster: true,
      relayDrafts: true,
      swims: { select: { id: true } },
    },
  })
  if (!meet) notFound()

  const meetPath = `/meets/${meet.slug ?? meet.id}`
  const relaysPath = `${meetPath}/relays`
  if (meet.slug && param !== meet.slug) redirect(relaysPath)

  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const lastActiveDate = new Date(meet.endsAt ?? meet.startsAt ?? meet.createdAt)
  lastActiveDate.setHours(0, 0, 0, 0)
  const meetHasEnded = lastActiveDate <= yesterday
  await deleteEndedMeetRelayDrafts(meet, meetHasEnded)

  const seasonAthletes = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, slug: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const relayLineups = buildRelayLineups(meet, seasonAthletes)
  // Staff build relays until the meet ends; anyone can view lineups once a relay exists.
  const canBuild = isStaff && !meetHasEnded
  if (!canBuild && relayLineups.length === 0) redirect(meetPath)

  const backLink = (
    <BackLink
      fallbackHref={meetPath}
      fallbackLabel={meet.name}
      className={relayBackLinkClass}
    />
  )

  const eventOrder = resolveSignupEventOptions(meet.eventOrder).filter((option) => option.isRelay)

  if (!canBuild) {
    // Event order supplies the event numbers; only events with a lineup are shown.
    const slots = relayEventSlots(eventOrder, relayLineups).filter((slot) =>
      relayLineups.some((relay) => slotMatches(slot, relay.gender, relay.event))
    )
    const publishedBySlot = slots.map((slot) => ({
      slot,
      published: relayLineups.filter((relay) => slotMatches(slot, relay.gender, relay.event)),
    }))
    const events = publishedBySlot.map(({ slot, published }) => ({
      slug: slot.slug,
      name: slot.label.replace(/ Relay$/, ""),
      number: slot.number,
      pills: [],
      state: "cards" as const,
      cards: publishedSummaryCards(published, viewerAthleteId),
    }))
    return (
      <main className="w-full flex flex-col gap-6 py-2 sm:py-4">
        <RelayPageHeader
          meetName={meet.name}
          iconUrl={meet.iconUrl}
          back={backLink}
          eyebrow={<p className={relayEyebrowClass}>Relays</p>}
          actions={
            <ShareRelaysButton
              meetName={meet.name}
              iconUrl={meet.iconUrl}
              events={publishedBySlot.map(({ slot, published }) => relayShareEvent(slot, published))}
            />
          }
        />
        <RelaySummary events={events} />
      </main>
    )
  }

  const athleteById = new Map(seasonAthletes.map((a) => [a.id, a]))
  // Once the final meet roster is imported, only those athletes can swim relays.
  const finalRoster = isMeetFinalRoster(meet.finalRoster) ? new Set(meet.finalRoster.athleteIds) : null
  const athletes = seasonAthletes
    .filter((athlete) => !finalRoster || finalRoster.has(athlete.id))
    .map((athlete) => ({
      id: athlete.id,
      name: athletePreferredName(athlete),
      gender: athlete.gender === Gender.F ? ("F" as const) : ("M" as const),
    }))

  const signupRelayPrefs = isSignupRelayPreferences(meet.signupRelayPreferences)
    ? Object.fromEntries(meet.signupRelayPreferences.athletes.map((a) => [a.athleteId, a.relays]))
    : null

  const drafts = relayDraftsOf(meet.relayDrafts)
  const slots = relayEventSlots(
    eventOrder.length > 0 || relayLineups.length > 0 || drafts.length > 0
      ? eventOrder
      : FALLBACK_RELAY_EVENTS.map((event) => ({ event, women: null, men: null })),
    [...relayLineups, ...drafts]
  )
  const slotData: RelaySlotData[] = slots.map((slot) => {
    const draft = drafts.find((d) => slotMatches(slot, d.gender, d.event))
    return {
      slot,
      published: relayLineups.filter((relay) => slotMatches(slot, relay.gender, relay.event)),
      draft: draft
        ? {
            savedAt: draft.savedAt,
            optimal: draft.optimal === true,
            published: draft.published === true,
            settings: draft.settings,
            teams: draft.teams.map((team) => ({
              letter: team.letter,
              legs: team.legs.map((leg) => {
                const athlete = athleteById.get(leg.athleteId)
                return {
                  athleteId: leg.athleteId,
                  name: athlete ? athletePreferredName(athlete) : "Unknown",
                  timeMs: leg.timeMs,
                  custom: leg.custom,
                }
              }),
            })),
          }
        : null,
    }
  })

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
    <MeetRelaysWorkspace
      meetId={meet.id}
      meetName={meet.name}
      relaysPath={relaysPath}
      iconUrl={meet.iconUrl}
      course={meet.course || "SCY"}
      slots={slotData}
      athletes={athletes}
      signupRelayPrefs={signupRelayPrefs}
      hasImportedResults={hasImportedResults}
      viewerAthleteId={viewerAthleteId}
      backLink={backLink}
    />
  )
}
