import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { formatDateRange } from "@/lib/utils"
import { Fragment } from "react"
import ImportMeetButton from "@/app/athletes/ImportMeetButton"
import ImportMeetResourcesButton from "./ImportMeetResourcesButton"
import AddTravelInfoButton from "./AddTravelInfoButton"
import MeetActions from "./MeetActions"
import AddMeetSwimButton from "./AddMeetSwimButton"
import { AddMeetRelayButton } from "./MeetRelayEditor"
import EventOrderButton from "./EventOrderButton"
import MeetSheetSummarySection from "./MeetSheetSummarySection"
import type { MeetFormState } from "../MeetFields"
import { isEventOrder } from "@/lib/meet-event-order"
import {
  isSheetSummary,
  meetHasImportedResults,
  mergeMeetResultEntries,
  swimsToMeetResults,
  isResultStatusesSummary,
} from "@/lib/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/relay-results"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete-view-server"
import { isStaffRole } from "@/lib/auth-roles"
import { Gender } from "@prisma/client"
import MeetResourceIcon, { type MeetResourceKind } from "@/components/MeetResourceIcon"
import { type TravelInfoKind } from "@/components/TravelInfoIcon"
import TravelInfoButtons, { type TravelInfoItem } from "./TravelInfoButtons"
import MeetSignupSection from "./MeetSignupSection"
import {
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTimes,
  isRelaySignupEvent,
  resolveSignupEventOptions,
  resolveEditableSignupSheetKeys,
} from "@/lib/meet-signup"
import { isSignupAnswers } from "@/lib/meet-signup"
import MeetRelayBuilder from "./MeetRelayBuilder"
import { relaySignupKey } from "@/lib/swim-parse"

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

const RESOURCE_LINKS: { key: keyof MeetLinks; label: string; icon: MeetResourceKind }[] = [
  { key: "packetUrl", label: "Meet Packet", icon: "packet" },
  { key: "entriesSheetUrl", label: "Entries", icon: "entries" },
  { key: "psychSheetUrl", label: "Psych Sheet", icon: "psych" },
  { key: "heatSheetUrl", label: "Heat Sheet", icon: "heat" },
  { key: "resultsUrl", label: "Results", icon: "results" },
  { key: "liveStreamUrl", label: "Live Stream", icon: "liveStream" },
]

type MeetLinks = {
  packetUrl: string | null
  psychSheetUrl: string | null
  heatSheetUrl: string | null
  entriesSheetUrl: string | null
  resultsUrl: string | null
  liveStreamUrl: string | null
}

const TRAVEL_LINKS: { key: "rideSignUpsUrl" | "roomsUrl"; label: string; icon: TravelInfoKind }[] = [
  { key: "rideSignUpsUrl", label: "Ride Sign-Ups", icon: "rideSignUps" },
  { key: "roomsUrl", label: "Rooms", icon: "rooms" },
]

const TRAVEL_TEXT_SECTIONS: {
  key: "hotel" | "packingList" | "itinerary"
  label: string
  icon: TravelInfoKind
}[] = [
  { key: "hotel", label: "Hotel", icon: "hotel" },
  { key: "packingList", label: "Packing List", icon: "packingList" },
  { key: "itinerary", label: "Itinerary", icon: "itinerary" },
]

export default async function MeetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/signin")

  const isCoach = await isStaffUi(session.user.role)
  const isStaff = isStaffRole(session.user.role)

  const meet = await prisma.meet.findUnique({
    where: { id },
    include: {
      swims: {
        include: { athlete: { select: { id: true, firstName: true, lastName: true } } },
      },
      signupForm: {
        include: {
          entries: {
            include: {
              athlete: {
                select: { id: true, firstName: true, lastName: true, gender: true },
              },
            },
            orderBy: [{ athlete: { lastName: "asc" } }, { athlete: { firstName: "asc" } }],
          },
        },
      },
    },
  })

  if (!meet) notFound()

  const viewerAthleteId = await resolveViewerAthleteId(session.user.id, session.user.role)

  const results = mergeMeetResultEntries(
    swimsToMeetResults(
      meet.swims.map((s) => ({
        id: s.id,
        source: s.source,
        athleteId: s.athlete.id,
        athleteName: `${s.athlete.lastName}, ${s.athlete.firstName}`,
        event: s.event,
        timeMs: s.timeMs,
        tags: s.tags,
        place: s.place,
        course: s.course,
        date: toDateInput(s.date),
      }))
    ),
    isResultStatusesSummary(meet.resultStatusesSummary)
      ? meet.resultStatusesSummary.entries
      : []
  )

  const initial: MeetFormState = {
    name: meet.name,
    location: meet.location ?? "",
    startDate: toDateInput(meet.startDate),
    endDate: toDateInput(meet.endDate),
    course: meet.course,
    season: meet.season,
    packetUrl: meet.packetUrl ?? "",
    psychSheetUrl: meet.psychSheetUrl ?? "",
    heatSheetUrl: meet.heatSheetUrl ?? "",
    resultsUrl: meet.resultsUrl ?? "",
  }

  const links = RESOURCE_LINKS.filter((l) => meet[l.key])
  const eventOrder = isEventOrder(meet.eventOrder) ? meet.eventOrder : null
  const hasResources = links.length > 0 || eventOrder !== null
  const resourceInitial = {
    teamCode: meet.teamCode ?? "GTSC",
    packetUrl: meet.packetUrl ?? "",
    entriesSheetUrl: meet.entriesSheetUrl ?? "",
    psychSheetUrl: meet.psychSheetUrl ?? "",
    heatSheetUrl: meet.heatSheetUrl ?? "",
    liveStreamUrl: meet.liveStreamUrl ?? "",
  }
  const travelLinks = TRAVEL_LINKS.filter((l) => meet[l.key])
  const travelTexts = TRAVEL_TEXT_SECTIONS.filter((s) => meet[s.key]?.trim())
  const travelItems: TravelInfoItem[] = [
    ...travelLinks.map((l) => ({
      type: "link" as const,
      label: l.label,
      icon: l.icon,
      href: meet[l.key] as string,
    })),
    ...travelTexts.map((s) => ({
      type: "text" as const,
      label: s.label,
      icon: s.icon,
      content: meet[s.key] as string,
    })),
  ]
  const hasTravel = travelItems.length > 0
  const psychSummary = isSheetSummary(meet.psychSheetSummary)
    ? meet.psychSheetSummary
    : null
  const heatSummary = isSheetSummary(meet.heatSheetSummary)
    ? meet.heatSheetSummary
    : null
  const entriesSummary = isSheetSummary(meet.entriesSheetSummary)
    ? meet.entriesSheetSummary
    : null
  const relayResults = isRelayResultsSummary(meet.relayResultsSummary)
    ? meet.relayResultsSummary.entries
    : null
  const hasImportedResults = meetHasImportedResults({
    individualResults: results,
    relayResults,
  })

  const seasonRoster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, gender: true },
  })
  const rosterAthletes = seasonRoster.map((a) => ({
    id: a.id,
    name: `${a.lastName}, ${a.firstName}`,
    gender: a.gender === Gender.F ? ("F" as const) : ("M" as const),
  }))

  const signupForm = meet.signupForm
    ? {
        id: meet.signupForm.id,
        enabled: meet.signupForm.enabled,
        instructions: meet.signupForm.instructions,
        minEvents: meet.signupForm.minEvents,
        maxEvents: meet.signupForm.maxEvents,
        maxRelayEvents: meet.signupForm.maxRelayEvents,
        askNotes: meet.signupForm.askNotes,
        customQuestions: normalizeMeetSignupQuestions(meet.signupForm.customQuestions),
        openAt: meet.signupForm.openAt?.toISOString() ?? null,
        closeAt: meet.signupForm.closeAt?.toISOString() ?? null,
        withdrawUntil: meet.signupForm.withdrawUntil?.toISOString() ?? null,
      }
    : null

  const mySignupEntry = (() => {
    if (!signupForm || !viewerAthleteId || !meet.signupForm) return null
    const entry = meet.signupForm.entries.find((e) => e.athleteId === viewerAthleteId)
    if (!entry) return null
    return {
      events: entry.events,
      entryTimes: normalizeSignupEntryTimes(entry.entryTimes),
      notes: entry.notes,
      answers: isSignupAnswers(entry.answers) ? entry.answers : {},
      updatedAt: entry.updatedAt.toISOString(),
    }
  })()

  const signupEntries =
    isCoach && meet.signupForm
      ? meet.signupForm.entries.map((e) => ({
          id: e.id,
          athleteId: e.athleteId,
          firstName: e.athlete.firstName,
          lastName: e.athlete.lastName,
          gender: e.athlete.gender === Gender.F ? ("F" as const) : ("M" as const),
          events: e.events,
          entryTimes: normalizeSignupEntryTimes(e.entryTimes),
          notes: e.notes,
          answers: e.answers,
          updatedAt: e.updatedAt.toISOString(),
        }))
      : []

  const signupAthleteIdsByEvent: Record<string, string[]> = {}
  const signupAthleteIds: string[] = []
  for (const entry of meet.signupForm?.entries ?? []) {
    if (!signupAthleteIds.includes(entry.athleteId)) {
      signupAthleteIds.push(entry.athleteId)
    }
    for (const ev of entry.events) {
      if (!isRelaySignupEvent(ev)) continue
      const key = relaySignupKey(ev)
      if (!key) continue
      if (!signupAthleteIdsByEvent[key]) signupAthleteIdsByEvent[key] = []
      if (!signupAthleteIdsByEvent[key].includes(entry.athleteId)) {
        signupAthleteIdsByEvent[key].push(entry.athleteId)
      }
    }
  }

  const signupEventOptions = resolveSignupEventOptions(meet.eventOrder)
  const relayEventOptions = signupEventOptions
    .filter((o) => o.isRelay)
    .map((o) => o.event)
  const individualEventOptions = signupEventOptions
    .filter((o) => !o.isRelay)
    .map((o) => o.event)
  const editableSeedKeys = resolveEditableSignupSheetKeys(
    entriesSummary,
    psychSummary,
    heatSummary,
    (meet.signupForm?.entries ?? []).map((e) => ({
      athleteId: e.athleteId,
      events: e.events,
    }))
  )

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/meets"
            className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
          >
            ← All meets
          </Link>
          <h1 className="mt-1 text-2xl font-medium">{meet.name}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {formatDateRange(meet.startDate, meet.endDate)}
            {meet.location ? ` · ${meet.location}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">
            {meet.course} · {meet.season}
          </p>
        </div>
        {isCoach && <MeetActions meetId={meet.id} initial={initial} meetName={meet.name} />}
      </div>

      {/* Resources */}
      {(hasResources || isCoach) && (
        <section>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
            <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
              Resources
            </h2>
            {isCoach && (
              <div className="flex flex-wrap items-center gap-1.5">
                <ImportMeetResourcesButton meetId={meet.id} initial={resourceInitial} />
                <Suspense fallback={null}>
                  <ImportMeetButton meetId={meet.id} season={meet.season} />
                </Suspense>
              </div>
            )}
          </div>
          {(hasResources || eventOrder) ? (
            <div className="flex flex-wrap gap-2">
              {links.map((l) => (
                <Fragment key={l.key}>
                  <a
                    href={meet[l.key] as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
                  >
                    <MeetResourceIcon kind={l.icon} />
                    {l.label}
                  </a>
                  {l.key === "packetUrl" && eventOrder ? (
                    <EventOrderButton order={eventOrder} />
                  ) : null}
                </Fragment>
              ))}
              {!meet.packetUrl && eventOrder ? (
                <EventOrderButton order={eventOrder} />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              No resources yet.
            </p>
          )}
        </section>
      )}

      {/* Travel */}
      {(hasTravel || isCoach) && (
        <section>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
            <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
              Travel
            </h2>
            {isCoach && (
              <AddTravelInfoButton
                meetId={meet.id}
                initial={{
                  rideSignUpsUrl: meet.rideSignUpsUrl ?? "",
                  roomsUrl: meet.roomsUrl ?? "",
                  hotel: meet.hotel ?? "",
                  packingList: meet.packingList ?? "",
                  itinerary: meet.itinerary ?? "",
                }}
              />
            )}
          </div>
          {hasTravel ? (
            <TravelInfoButtons items={travelItems} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              No travel info yet.
            </p>
          )}
        </section>
      )}

      <MeetSignupSection
        meetId={meet.id}
        eventOrder={meet.eventOrder}
        course={meet.course}
        isCoach={isCoach}
        isStaff={isStaff}
        selfAthleteId={viewerAthleteId}
        athletes={rosterAthletes.map((a) => ({
          id: a.id,
          name: a.name,
          gender: a.gender,
        }))}
        form={signupForm}
        myEntry={mySignupEntry}
        entries={signupEntries}
        hasImportedResults={hasImportedResults}
      />

      {isCoach && (
        <MeetRelayBuilder
          meetId={meet.id}
          defaultCourse={meet.course}
          relayEvents={relayEventOptions}
          athletes={rosterAthletes}
          signupAthleteIds={signupAthleteIds}
          signupAthleteIdsByEvent={signupAthleteIdsByEvent}
          hasImportedResults={hasImportedResults}
        />
      )}

      <MeetSheetSummarySection
        psychSummary={psychSummary}
        heatSummary={heatSummary}
        entriesSummary={entriesSummary}
        results={results}
        relayResults={relayResults}
        meetId={meet.id}
        meetName={meet.name}
        athletes={rosterAthletes}
        canEdit={isCoach}
        viewerAthleteId={viewerAthleteId}
        individualEventOptions={individualEventOptions}
        editableSeedKeys={editableSeedKeys}
        eventNumberOptions={signupEventOptions}
        headerAction={
          isCoach ? (
            <div className="flex flex-wrap gap-2">
              <AddMeetRelayButton
                meetId={meet.id}
                athletes={rosterAthletes}
              />
              <AddMeetSwimButton
                meetId={meet.id}
                meetName={meet.name}
                defaultCourse={meet.course}
                defaultDate={toDateInput(meet.startDate)}
                athletes={rosterAthletes}
              />
            </div>
          ) : null
        }
      />
    </main>
  )
}
