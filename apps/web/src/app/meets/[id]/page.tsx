import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import BackLink from "@/components/BackLink"
import PageLabelRegistrar from "@/components/PageLabelRegistrar"
import { formatDateRange } from "@/lib/utils"
import { formatClockTime } from "@swimbuzz/shared"
import { Fragment } from "react"
import ImportMeetButton from "@/app/athletes/ImportMeetButton"
import ImportMeetResourcesButton from "./ImportMeetResourcesButton"
import ManagePhotosButton from "./ManagePhotosButton"
import AddTravelInfoButton from "./AddTravelInfoButton"
import MeetActions from "./MeetActions"
import AddResultButton from "./AddResultButton"
import AddIndividualEntryButton from "./AddIndividualEntryButton"
import AddToRosterSummaryButton from "./AddToRosterSummaryButton"
import PhotosButtons, { PreviewSlideshow } from "./PhotosButtons"
import MeetPageBackground from "./MeetPageBackground"
import EventOrderButton from "./EventOrderButton"
import MeetSheetSummarySection from "./MeetSheetSummarySection"
import ScrollToHash from "./ScrollToHash"
import type { MeetFormState } from "../MeetFields"
import { isEventOrder } from "@/lib/meet-event-order"
import {
  isSheetSummary,
  meetHasImportedResults,
  mergeMeetResultEntries,
  swimsToMeetResults,
  isResultStatusesSummary,
  collectMeetRosterAthleteIds } from "@/lib/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/relay-results"
import {
  normalizeFinalsHeatSheetUrls,
  normalizeHeatSheetUrls,
} from "@/lib/meet-files"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete-view-server"
import { isStaffRole } from "@/lib/auth-roles"
import { Gender } from "@prisma/client"
import MeetResourceIcon, { type MeetResourceKind } from "@/components/MeetResourceIcon"
import FilePreviewButton from "@/components/FilePreview"
import InfoIcon, { type InfoKind } from "@/components/InfoIcon"
import { type TravelInfoKind } from "@/components/TravelInfoIcon"
import TravelInfoButtons, { type TravelInfoItem } from "./TravelInfoButtons"
import MeetSignupSection from "./MeetSignupSection"
import MeetRoomSection from "./MeetRoomSection"
import MeetCountdown from "@/components/MeetCountdown"
import {
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTimes,
  resolveSignupEventOptions,
  resolveEditableSignupSheetKeys,
} from "@/lib/meet-signup"
import { isSignupAnswers } from "@/lib/meet-signup"
import { athletePath, isCuid, meetPath } from "@/lib/slug"
import StatsHighlights from "@/components/StatsHighlights"
import { getSession } from "@/lib/session"
import {
  buildAthletePbMap,
  computeMeetPrepHighlights,
  computeMeetResultHighlights } from "@/lib/meet-stats"

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

const RESOURCE_LINKS: { key: keyof MeetLinks; label: string; icon: MeetResourceKind; forcePdf?: boolean }[] = [
  { key: "packetUrl", label: "Meet Packet", icon: "packet", forcePdf: true },
  { key: "entriesSheetUrl", label: "Entries", icon: "entries", forcePdf: true },
  { key: "psychSheetUrl", label: "Psych Sheet", icon: "psych", forcePdf: true },
  { key: "swimphoneUrl", label: "SwimPhone Results", icon: "results" },
  { key: "resultsUrl", label: "Results PDF", icon: "results", forcePdf: true },
  { key: "liveStreamUrl", label: "Live Stream", icon: "liveStream" },
]

type MeetLinks = {
  packetUrl: string | null
  psychSheetUrl: string | null
  entriesSheetUrl: string | null
  resultsUrl: string | null
  swimphoneUrl: string | null
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
  const { id: param } = await params
  const session = await getSession()
  if (!session) redirect("/signin")

  const isCoach = await isStaffUi(session.user.role)
  const isStaff = isStaffRole(session.user.role)

  const meet = await prisma.meet.findFirst({
    where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
    include: {
      swims: {
        include: { athlete: { select: { id: true, firstName: true, lastName: true } } }},
      signupForm: {
        include: {
          entries: {
            include: {
              athlete: {
                select: { id: true, firstName: true, lastName: true, gender: true }}},
            orderBy: [{ athlete: { lastName: "asc" } }, { athlete: { firstName: "asc" } }]}}},
      roomForm: {
        include: {
          preferences: {
            include: {
              athlete: {
                select: { id: true, firstName: true, lastName: true, gender: true }}},
            orderBy: [{ updatedAt: "desc" }]},
          rooms: {
            include: {
              assignments: {
                include: {
                  athlete: {
                    select: { id: true, firstName: true, lastName: true, gender: true }}}}},
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }]}}}}})

  if (!meet) notFound()
  if (meet.slug && param !== meet.slug) redirect(meetPath(meet.slug))

  const meetPublicPath = meetPath(meet.slug ?? meet.id)

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
        date: toDateInput(s.date)}))
    ),
    isResultStatusesSummary(meet.resultStatusesSummary)
      ? meet.resultStatusesSummary.entries
      : []
  )

  const initial: MeetFormState = {
    name: meet.name,
    location: meet.location ?? "",
    startDate: toDateInput(meet.startDate),
    startTime: meet.startTime ?? "",
    endDate: toDateInput(meet.endDate),
    course: meet.course,
    season: meet.season,
    school: meet.school ?? "",
    iconUrl: meet.iconUrl ?? "",
    bannerUrl: meet.bannerUrl ?? "",
    packetUrl: meet.packetUrl ?? "",
    psychSheetUrl: meet.psychSheetUrl ?? "",
    heatSheetUrl: meet.heatSheetUrl ?? "",
    resultsUrl: meet.resultsUrl ?? ""}

  let initialPhotos: { url: string; name: string }[] = []
  let initialPreviews: string[] = []
  if (meet.photos) {
    if (Array.isArray(meet.photos)) {
      initialPhotos = meet.photos as { url: string; name: string }[]
    } else if (typeof meet.photos === "object") {
      const obj = meet.photos as { links?: { url: string; name: string }[]; previews?: string[] }
      initialPhotos = obj.links || []
      initialPreviews = obj.previews || []
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const meetStartDate = toDateInput(meet.startDate)
  const isBeforeOrToday = meetStartDate <= today
  const isUpcomingMeet = toDateInput(meet.endDate ?? meet.startDate) >= today
  const courseLabel = { SCY: "Short course yards", SCM: "Short course meters", LCM: "Long course meters" }[meet.course] ?? meet.course
  const signupStatus = !meet.signupForm
    ? "Not set"
    : !meet.signupForm.openAt || new Date(meet.signupForm.openAt) > new Date()
      ? "Opens soon"
      : meet.signupForm.closeAt && new Date(meet.signupForm.closeAt) < new Date()
        ? "Closed"
        : "Open"
  const signupEntryCount = meet.signupForm?.entries.length ?? 0

  const storedHeatSheetLinks = normalizeHeatSheetUrls(meet.heatSheetUrls)
  const heatSheetLinks =
    storedHeatSheetLinks ?? (meet.heatSheetUrl ? [{ url: meet.heatSheetUrl }] : [])
  const finalsHeatSheetLinks = normalizeFinalsHeatSheetUrls(meet.finalsHeatSheetUrls) ?? []
  const links = RESOURCE_LINKS.filter((l) => meet[l.key])
  const resourceLinksBeforeResults = links.filter(
    (link) => link.key !== "resultsUrl" && link.key !== "swimphoneUrl"
  )
  const swimphoneResultsLink = links.find((link) => link.key === "swimphoneUrl")
  const resultsPdfLink = links.find((link) => link.key === "resultsUrl")
  const eventOrder = isEventOrder(meet.eventOrder) ? meet.eventOrder : null
  const hasResources =
    links.length > 0 ||
    eventOrder !== null ||
    heatSheetLinks.length > 0 ||
    finalsHeatSheetLinks.length > 0
  const resourceInitial = {
    teamCode: meet.teamCode ?? "GTSC",
    packetUrl: meet.packetUrl ?? "",
    entriesSheetUrl: meet.entriesSheetUrl ?? "",
    psychSheetUrl: meet.psychSheetUrl ?? "",
    heatSheetUrls: heatSheetLinks,
    finalsHeatSheetUrls: finalsHeatSheetLinks,
    liveStreamUrl: meet.liveStreamUrl ?? ""}
  const photosInitial = {
    photos: initialPhotos,
    previews: initialPreviews}
const isHtmlEmpty = (html: string | null | undefined) =>
  !html || html.replace(/<[^>]*>?/gm, "").trim() === ""

const travelLinks = TRAVEL_LINKS.filter((l) => meet[l.key])
const travelTexts = TRAVEL_TEXT_SECTIONS.filter((s) => !isHtmlEmpty(meet[s.key]))
  const travelItems: TravelInfoItem[] = [
    ...travelLinks.map((l) => ({
      type: "link" as const,
      label: l.label,
      icon: l.icon,
      href: meet[l.key] as string})),
    ...travelTexts.map((s) => ({
      type: "text" as const,
      label: s.label,
      icon: s.icon,
      content: meet[s.key] as string})),
  ]
  const hasTravel = travelItems.length > 0
  const psychSummary = isSheetSummary(meet.psychSheetSummary)
    ? meet.psychSheetSummary
    : null
  const heatSummary = isSheetSummary(meet.heatSheetSummary)
    ? meet.heatSheetSummary
    : null
  const finalsHeatSummary = isSheetSummary(meet.finalsHeatSheetSummary)
    ? meet.finalsHeatSheetSummary
    : null
  const entriesSummary = isSheetSummary(meet.entriesSheetSummary)
    ? meet.entriesSheetSummary
    : null
  const relayResults = isRelayResultsSummary(meet.relayResultsSummary)
    ? meet.relayResultsSummary.entries
    : null
  const hasImportedResults = meetHasImportedResults({
    individualResults: results,
    relayResults})

  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  const lastActiveDate = new Date(meet.endDate ?? meet.startDate)
  lastActiveDate.setHours(0, 0, 0, 0)

  const meetHasEnded = lastActiveDate <= yesterday

  const hasSignupEntries = meet.signupForm ? meet.signupForm.entries.length > 0 : false
  const showSignupSection = !meetHasEnded || hasSignupEntries

  const roomForm = meet.roomForm
    ? {
        id: meet.roomForm.id,
        instructions: meet.roomForm.instructions,
        maxPreferences: meet.roomForm.maxPreferences,
        openAt: meet.roomForm.openAt?.toISOString() ?? null,
        closeAt: meet.roomForm.closeAt?.toISOString() ?? null,
        assignmentsPublishedAt: meet.roomForm.assignmentsPublishedAt?.toISOString() ?? null,
        customQuestions: normalizeMeetSignupQuestions(meet.roomForm.customQuestions)}
    : null

  const myRoomPreference = (() => {
    if (!roomForm || !viewerAthleteId || !meet.roomForm) return null
    const pref = meet.roomForm.preferences.find((p) => p.athleteId === viewerAthleteId)
    if (!pref) return null
    return {
      preferredAthleteIds: pref.preferredAthleteIds,
      excludedAthleteIds: pref.excludedAthleteIds,
      notes: pref.notes,
      answers: isSignupAnswers(pref.answers) ? pref.answers : {},
      updatedAt: pref.updatedAt.toISOString()}
  })()

  const roomPreferences =
    isCoach && meet.roomForm
      ? meet.roomForm.preferences.map((p) => ({
          id: p.id,
          athleteId: p.athleteId,
          firstName: p.athlete.firstName,
          lastName: p.athlete.lastName,
          gender: p.athlete.gender === Gender.F ? ("F" as const) : ("M" as const),
          preferredAthleteIds: p.preferredAthleteIds,
          excludedAthleteIds: p.excludedAthleteIds,
          notes: p.notes,
          answers: isSignupAnswers(p.answers) ? p.answers : {},
          updatedAt: p.updatedAt.toISOString()}))
      : []

  const roomAssignments =
    meet.roomForm && (isCoach || meet.roomForm.assignmentsPublishedAt)
      ? meet.roomForm.rooms.map((r) => ({
          id: r.id,
          label: r.label,
          sortOrder: r.sortOrder,
          athleteIds: r.assignments.map((a) => a.athleteId),
          athletes: r.assignments.map((a) => ({
            id: a.athlete.id,
            firstName: a.athlete.firstName,
            lastName: a.athlete.lastName}))}))
      : []

  const seasonRoster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { 
      id: true,
      slug: true,
      firstName: true, 
      lastName: true, 
      gender: true,
      user: { select: { image: true } }
    }})
  const rosterAthletes = seasonRoster.map((a) => ({
    id: a.id,
    slug: a.slug ?? a.id,
    name: `${a.lastName}, ${a.firstName}`,
    gender: a.gender === Gender.F ? ("F" as const) : ("M" as const),
    image: a.user.image}))

  const signupForm = meet.signupForm
    ? {
        id: meet.signupForm.id,
        instructions: meet.signupForm.instructions,
        minEvents: meet.signupForm.minEvents,
        maxEvents: meet.signupForm.maxEvents,
        maxRelayEvents: meet.signupForm.maxRelayEvents,
        askNotes: meet.signupForm.askNotes,
        customQuestions: normalizeMeetSignupQuestions(meet.signupForm.customQuestions),
        openAt: meet.signupForm.openAt?.toISOString() ?? null,
        closeAt: meet.signupForm.closeAt?.toISOString() ?? null,
        withdrawUntil: meet.signupForm.withdrawUntil?.toISOString() ?? null}
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
      updatedAt: entry.updatedAt.toISOString()}
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
          updatedAt: e.updatedAt.toISOString()}))
      : []

  const signupAthleteIds: string[] = []
  for (const entry of meet.signupForm?.entries ?? []) {
    if (!signupAthleteIds.includes(entry.athleteId)) {
      signupAthleteIds.push(entry.athleteId)
    }
  }

  const meetRosterAthleteIds = new Set(
    collectMeetRosterAthleteIds({
      psychSheetSummary: meet.psychSheetSummary,
      heatSheetSummary: meet.heatSheetSummary,
      finalsHeatSheetSummary: meet.finalsHeatSheetSummary,
      entriesSheetSummary: meet.entriesSheetSummary,
      relayResultsSummary: meet.relayResultsSummary,
      resultStatusesSummary: meet.resultStatusesSummary,
      swimAthleteIds: meet.swims.map((s) => s.athlete.id),
      signupAthleteIds})
  )
  const meetRosterAthletes = rosterAthletes.filter((a) => meetRosterAthleteIds.has(a.id))
  const viewerOnMeetRoster =
    viewerAthleteId != null && meetRosterAthleteIds.has(viewerAthleteId)
  const showRoomSection = !meetHasEnded && (isCoach || viewerOnMeetRoster)

  const signupEventOptions = resolveSignupEventOptions(meet.eventOrder)
  const individualEventOptions = signupEventOptions
    .filter((o) => !o.isRelay)
    .map((o) => o.event)
  const editableSeedKeys = resolveEditableSignupSheetKeys(
    entriesSummary,
    psychSummary,
    heatSummary,
    (meet.signupForm?.entries ?? []).map((e) => ({
      athleteId: e.athleteId,
      events: e.events}))
  )

  const meetSwimsForStats = meet.swims.map((s) => ({
    id: s.id,
    athleteId: s.athlete.id,
    event: s.event,
    course: s.course,
    timeMs: s.timeMs}))

  let meetHighlights = null
  if (hasImportedResults || meet.swims.length > 0) {
    const athleteIds = [
      ...new Set([
        ...meet.swims.map((s) => s.athlete.id),
        ...results.map((r) => r.athleteId),
      ]),
    ]
    const pbSwims =
      athleteIds.length > 0
        ? await prisma.swim.findMany({
            where: { athleteId: { in: athleteIds } },
            select: {
              athleteId: true,
              event: true,
              course: true,
              timeMs: true}})
        : []
    const athleteHrefById = new Map(
      seasonRoster.map((a) => [a.id, athletePath(a.slug ?? a.id)])
    )
    meetHighlights = computeMeetResultHighlights({
      results,
      meetSwims: meetSwimsForStats,
      pbMap: buildAthletePbMap(pbSwims),
      athleteHrefById,
      relayResults})
  } else if (meet.signupForm && meet.signupForm.entries.length > 0) {
    meetHighlights = computeMeetPrepHighlights(
      meet.signupForm.entries.map((e) => ({
        athleteId: e.athleteId,
        events: e.events}))
    )
  }

  return (
    <div className="relative">
      {meet.bannerUrl && (
        <MeetPageBackground
          bannerUrl={meet.bannerUrl}
          photoUrls={initialPreviews}
        />
      )}
    <main className="relative mx-auto max-w-4xl">
      <div className="relative z-10 space-y-8">
      <PageLabelRegistrar label={meet.name} />
      <ScrollToHash />
      {/* Header */}
      <div className="space-y-4">
      <div className="min-w-0">
          <BackLink
            fallbackHref="/meets"
            fallbackLabel="Meets"
            className="text-sm font-medium text-foreground-tertiary hover:text-foreground"
          />
          <div className="mt-1 flex items-center gap-4 sm:gap-5">
            {meet.iconUrl && (
              <img
                src={meet.iconUrl}
                alt={`${meet.name} icon`}
                className="h-20 w-20 rounded-xl object-cover shadow-sm ring-1 ring-border shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h1 className="min-w-0 text-3xl font-semibold text-foreground sm:text-4xl">{meet.name}</h1>
                {isCoach && (
                  <MeetActions
                    meetId={meet.id}
                    meetSlug={meet.slug}
                    initial={initial}
                    meetName={meet.name}
                    hasSwims={meet.swims.length > 0 || (relayResults?.length ?? 0) > 0}
                  />
                )}
              </div>
              <div className="mt-1 text-base text-foreground-secondary sm:text-lg">
                <div className="flex items-center gap-1.5">
                  <InfoIcon kind="calendar" />
                  {formatDateRange(meet.startDate, meet.endDate)}
                  {meet.startTime ? ` · ${formatClockTime(meet.startTime)}` : ""}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {meet.location && (
                    <span className="flex items-center gap-1.5">
                      <InfoIcon kind="location" />
                      {meet.location}
                    </span>
                  )}
                  {meet.location && meet.school && <span>·</span>}
                  {meet.school && (
                    <span>{meet.school}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      {(isUpcomingMeet && meet.startTime) || meetHighlights ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
          {isUpcomingMeet && meet.startTime ? (
            <MeetCountdown
              className="min-w-0 sm:flex-1"
              startDate={meet.startDate}
              startTime={meet.startTime}
              upcoming={false}
              variant="banner"
            />
          ) : null}
          {meetHighlights ? (
            <StatsHighlights
              className={
                isUpcomingMeet && meet.startTime
                  ? "min-w-0 sm:flex-1"
                  : "w-full"
              }
              title="Highlights"
              counters={meetHighlights.counters}
              spotlight={meetHighlights.spotlight}
            />
          ) : null}
        </div>
      ) : null}
      </div>

      {/* Resources */}
      {(hasResources || isCoach) && (
        <section>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
            <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
              Resources
            </h2>
            {isCoach && (
              <div className="flex flex-wrap items-center gap-1.5">
                <ImportMeetResourcesButton meetId={meet.id} initial={resourceInitial} />
                <Suspense fallback={null}>
                  <ImportMeetButton
                    key={`results-${meet.resultsUrl ?? ""}-${meet.swimphoneUrl ?? ""}`}
                    meetId={meet.id}
                    season={meet.season}
                    resultsUrl={meet.resultsUrl ?? ""}
                    swimphoneUrl={meet.swimphoneUrl ?? ""}
                  />
                </Suspense>
              </div>
            )}
          </div>
      {(hasResources || eventOrder) ? (
        <div className="flex flex-wrap gap-2">
          {resourceLinksBeforeResults.map((l) => (
            <Fragment key={l.key}>
              <FilePreviewButton
                url={meet[l.key] as string}
                title={l.label}
                forcePdf={l.forcePdf}
                className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"
              >
                <MeetResourceIcon kind={l.icon} />
                {l.label}
              </FilePreviewButton>
              {l.key === "packetUrl" && eventOrder ? (
                <EventOrderButton order={eventOrder} />
              ) : null}
            </Fragment>
          ))}
          {!meet.packetUrl && eventOrder ? (
            <EventOrderButton order={eventOrder} />
          ) : null}
          {heatSheetLinks.map((link, index) => (
            <FilePreviewButton
              key={`heat-${index}-${link.url}`}
              url={link.url}
              forcePdf
              title={
                link.name?.trim() ||
                (heatSheetLinks.length > 1 ? `Heat Sheet ${index + 1}` : "Heat Sheet")
              }
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"
            >
              <MeetResourceIcon kind="heat" />
              {link.name?.trim() ||
                (heatSheetLinks.length > 1 ? `Heat Sheet ${index + 1}` : "Heat Sheet")}
            </FilePreviewButton>
          ))}
          {finalsHeatSheetLinks.map((link, index) => (
            <FilePreviewButton
              key={`finals-${index}-${link.url}`}
              url={link.url}
              forcePdf
              title={
                link.name?.trim() ||
                (finalsHeatSheetLinks.length > 1
                  ? `Finals Heat Sheet ${index + 1}`
                  : "Finals Heat Sheet")
              }
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"
            >
              <MeetResourceIcon kind="heat" />
              {link.name?.trim() ||
                (finalsHeatSheetLinks.length > 1
                  ? `Finals Heat Sheet ${index + 1}`
                  : "Finals Heat Sheet")}
            </FilePreviewButton>
          ))}
          {swimphoneResultsLink ? (
            <a
              href={meet[swimphoneResultsLink.key] as string}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"
            >
              <MeetResourceIcon kind={swimphoneResultsLink.icon} />
              {swimphoneResultsLink.label}
            </a>
          ) : null}
          {resultsPdfLink ? (
            <FilePreviewButton
              url={meet[resultsPdfLink.key] as string}
              title={resultsPdfLink.label}
              forcePdf={resultsPdfLink.forcePdf}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"
            >
              <MeetResourceIcon kind={resultsPdfLink.icon} />
              {resultsPdfLink.label}
            </FilePreviewButton>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-foreground-secondary">No resources yet.</p>
      )}
        </section>
      )}

      {/* Travel */}
      {(hasTravel || isCoach) && (
        <section>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
            <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
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
                  itinerary: meet.itinerary ?? ""}}
              />
            )}
          </div>
          {hasTravel ? (
            <TravelInfoButtons items={travelItems} />
          ) : (
            <p className="text-sm text-foreground-secondary">
              No travel info yet.
            </p>
          )}
        </section>
      )}

      {showSignupSection && (
        <MeetSignupSection
          meetPath={meetPublicPath}
          meetId={meet.id}
          eventOrder={meet.eventOrder}
          course={meet.course}
          isCoach={isCoach}
          isStaff={isStaff}
          selfAthleteId={viewerAthleteId}
          athletes={rosterAthletes.map((a) => ({
            id: a.id,
            name: a.name,
            gender: a.gender}))}
          form={signupForm}
          myEntry={mySignupEntry}
          entries={signupEntries}
          hasImportedResults={hasImportedResults}
        />
      )}

      {showRoomSection && (
        <MeetRoomSection
          meetPath={meetPublicPath}
          meetId={meet.id}
          isCoach={isCoach}
          selfAthleteId={viewerAthleteId}
          athletes={meetRosterAthletes.map((a) => ({
            id: a.id,
            name: a.name,
            gender: a.gender}))}
          form={roomForm}
          myPreference={myRoomPreference}
          preferences={roomPreferences}
          rooms={roomAssignments}
          meetHasEnded={meetHasEnded}
        />
      )}

      {isCoach && !meetHasEnded && (
        <section>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-foreground-secondary">
              Relay builder
            </h2>
          </div>
          <Link
            href={`${meetPublicPath}/relays`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-text transition-colors hover:bg-primary-hover"
          >
            Build relay teams
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      )}

      {/* Photos Section */}
      {isBeforeOrToday && (initialPhotos.length > 0 || initialPreviews.length > 0 || isCoach) && (
        <section className="space-y-3">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
            <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
              Photos
            </h2>
            {isCoach && (
              <ManagePhotosButton meetId={meet.id} initial={photosInitial} />
            )}
            {initialPhotos.length > 0 && (
              <PhotosButtons photos={initialPhotos} label="All Photos" />
            )}
          </div>
          {initialPhotos.length > 0 || initialPreviews.length > 0 ? (
            initialPreviews.length > 0 && (
              <PreviewSlideshow previews={initialPreviews} />
            )
          ) : (
            <p className="text-sm text-foreground-secondary">
              No photos yet.
            </p>
          )}
        </section>
      )}

      <MeetSheetSummarySection
        psychSummary={psychSummary}
        heatSummary={heatSummary}
        finalsHeatSummary={finalsHeatSummary}
        entriesSummary={entriesSummary}
        results={results}
        relayResults={relayResults}
        meetId={meet.id}
        meetName={meet.name}
        athletes={rosterAthletes}
        rosterAthletes={meetRosterAthletes}
        canEdit={isCoach}
        viewerAthleteId={viewerAthleteId}
        individualEventOptions={individualEventOptions}
        editableSeedKeys={editableSeedKeys}
        eventNumberOptions={signupEventOptions}
        headerAction={
          isCoach ? (
            <div key="header-actions" className="flex flex-wrap gap-2">
              <AddToRosterSummaryButton
                key="add-roster-btn"
                meetId={meet.id}
                athletes={rosterAthletes}
                rosterSummaryEntries={entriesSummary?.entries ?? []}
              />
              <AddResultButton
                key="add-result-btn"
                meetId={meet.id}
                meetName={meet.name}
                defaultCourse={meet.course}
                defaultDate={toDateInput(meet.startDate)}
                athletes={rosterAthletes}
              />
              <AddIndividualEntryButton
                key="add-entry-btn"
                meetId={meet.id}
                athletes={rosterAthletes}
              />
            </div>
          ) : null
        }
      />
      </div>
    </main>
    </div>
  )
}
