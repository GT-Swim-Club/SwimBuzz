import { Fragment, Suspense, type ReactNode } from "react"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import BackLink from "@/components/ui/BackLink"
import PageLabelRegistrar from "@/components/nav/PageLabelRegistrar"
import { RelativeDateRangeTime } from "@/components/ui/RelativeDate"
import MeetActions from "./MeetActions"
import MeetPageBackground from "./MeetPageBackground"
import MeetSheetSummarySection from "./MeetSheetSummarySection"
import ScrollToHash from "./ScrollToHash"
import type { MeetFormState } from "../MeetFields"
import { isEventOrder } from "@/lib/meet/meet-event-order"
import {
  isSheetSummary,
  meetHasImportedResults,
  mergeMeetResultEntries,
  swimsToMeetResults,
  isResultStatusesSummary,
  collectMeetRosterAthleteIds } from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"
import {
  normalizeFinalsHeatSheetUrls,
  normalizeHeatSheetUrls,
} from "@/lib/meet/meet-files"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete/athlete-view-server"
import { Gender } from "@prisma/client"
import InfoIcon, { type InfoKind } from "@/components/ui/InfoIcon"
import { type TravelInfoKind } from "@/components/ui/TravelInfoIcon"
import { type TravelInfoItem } from "./TravelInfoButtons"
import MeetSignupSection from "./MeetSignupSection"
import MeetRoomSection from "./MeetRoomSection"
import MeetCountdown from "@/components/meet/MeetCountdown"
import MeetHighlightsCarousel from "@/components/meet/MeetHighlightsCarousel"
import MeetPreSheetsLayout from "./MeetPreSheetsLayout"
import MeetLedgerLayout from "./MeetLedgerLayout"
import {
  MeetCompetitionCard,
  MeetPhotosCard,
  MeetTravelCard,
  type CompetitionLink,
} from "./MeetLedgerCards"
import {
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTimes,
  resolveSignupEventOptions,
  resolveEditableSignupSheetKeys,
} from "@/lib/meet/meet-signup"
import { isSignupAnswers } from "@/lib/meet/meet-signup"
import { athletePath, isCuid, meetPath } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import {
  buildAthletePbMap,
  computeMeetPrepHighlights,
  computeMeetResultHighlights } from "@/lib/meet/meet-stats"
import { toDateInput, toTimeInput } from "@/lib/date-input"
import { utcDayKey, COURSE_LABELS, type CourseCode } from "@swimbuzz/shared"
import LoadingComponent from "./loading"

const RESOURCE_KEYS = [
  "packetUrl",
  "entriesSheetUrl",
  "psychSheetUrl",
  "swimphoneUrl",
  "resultsUrl",
  "liveStreamUrl",
] as const

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

async function MeetPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) redirect("/signin")

  const [isCoach, meet, viewerAthleteId] = await Promise.all([
    isStaffUi(session.user.role),
    prisma.meet.findFirst({
    where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
    include: {
      swims: {
        include: { athlete: { select: { id: true, firstName: true, lastName: true } } }},
      signupForm: {
        include: {
          entries: {
            include: {
              athlete: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  gender: true,
                  user: { select: { staffTitle: true } }}}},
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
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }]}}}}}),
    resolveViewerAthleteId(session.user.id),
  ])

  if (!meet) notFound()
  if (meet.slug && param !== meet.slug) redirect(meetPath(meet.slug))

  const meetPublicPath = meetPath(meet.slug ?? meet.id)
  const meetStartsAt = meet.startsAt ?? meet.createdAt

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
        date: utcDayKey(s.date)}))
    ),
    isResultStatusesSummary(meet.resultStatusesSummary)
      ? meet.resultStatusesSummary.entries
      : []
  )

  const initial: MeetFormState = {
    name: meet.name,
    location: meet.location ?? "",
    startDate: toDateInput(meet.startsAt, meet.timeZone),
    startTime: meet.hasStartTime ? toTimeInput(meet.startsAt, meet.timeZone) : "",
    timeZone: meet.timeZone,
    endDate: toDateInput(meet.endsAt, meet.timeZone),
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
  const meetStartDate = toDateInput(meet.startsAt, meet.timeZone)
  const isBeforeOrToday = meetStartDate <= today
  const isUpcomingMeet = toDateInput(meet.endsAt ?? meet.startsAt, meet.timeZone) >= today
  const courseLabel = COURSE_LABELS[meet.course as CourseCode] ?? meet.course
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
  const meetFileName = (label: string) => `${meet.name} - ${label}`
  const eventOrder = isEventOrder(meet.eventOrder) ? meet.eventOrder : null
  const hasResources =
    RESOURCE_KEYS.some((key) => meet[key]) ||
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
    liveStreamUrl: meet.liveStreamUrl ?? "",
    swimphoneUrl: meet.swimphoneUrl ?? "",
    resultsUrl: meet.resultsUrl ?? ""}
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

  const lastActiveDate = new Date(meet.endsAt ?? meetStartsAt)
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
      user: { select: { image: true, staffTitle: true } }
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
          staffTitle: e.athlete.user?.staffTitle ?? null,
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

  const header = (
    <>
      <PageLabelRegistrar label={meet.name} />
      <ScrollToHash />
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
                className="h-20 w-20 rounded-xl object-cover shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h1 className="min-w-0 text-4xl font-semibold text-foreground sm:text-5xl">{meet.name}</h1>
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
              <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-lg text-foreground-secondary sm:text-xl">
                <span className="flex items-center gap-1.5">
                  <InfoIcon kind="calendar" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                  <RelativeDateRangeTime
                    startsAt={meetStartsAt}
                    endsAt={meet.endsAt}
                    timeZone={meet.timeZone}
                    hasStartTime={meet.hasStartTime}
                  />
                </span>
                {meet.location || meet.school ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {meet.location && (
                      <span className="flex items-center gap-1.5">
                        <InfoIcon kind="location" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                        {meet.location}
                      </span>
                    )}
                    {meet.location && meet.school && <span>·</span>}
                    {meet.school && <span>{meet.school}</span>}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
    </>
  )

  const summarySection = (
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
      defaultCourse={meet.course}
      defaultDate={toDateInput(meet.startsAt, meet.timeZone)}
    />
  )

  const hasRosterSummaryContent =
    [psychSummary, heatSummary, finalsHeatSummary, entriesSummary].some(
      (summary) => (summary?.entries.length ?? 0) > 0
    ) ||
    results.length > 0 ||
    (relayResults?.length ?? 0) > 0

  const heatLinkLabel = (
    link: { name?: string | null },
    index: number,
    count: number,
    base: string
  ) => link.name?.trim() || (count > 1 ? `${base} ${index + 1}` : base)
  const linksBeforeOrder: CompetitionLink[] = meet.packetUrl
    ? [{ key: "packet", label: "Meet packet", url: meet.packetUrl, icon: "file", forcePdf: true, downloadName: meetFileName("Meet Packet") }]
    : []
  const linksAfterOrder: CompetitionLink[] = [
    ...(meet.entriesSheetUrl
      ? [{ key: "entries", label: "Entries", url: meet.entriesSheetUrl, icon: "fileList", forcePdf: true, downloadName: meetFileName("Entries") } as const]
      : []),
    ...(meet.psychSheetUrl
      ? [{ key: "psych", label: "Psych sheet", url: meet.psychSheetUrl, icon: "chart", forcePdf: true, downloadName: meetFileName("Psych Sheet") } as const]
      : []),
    ...heatSheetLinks.map((link, index) => ({
      key: `heat-${index}-${link.url}`,
      label: heatLinkLabel(link, index, heatSheetLinks.length, "Heat sheet"),
      url: link.url,
      icon: "lanes" as const,
      forcePdf: true,
      downloadName: meetFileName(heatLinkLabel(link, index, heatSheetLinks.length, "Heat Sheet")),
    })),
    ...finalsHeatSheetLinks.map((link, index) => ({
      key: `finals-${index}-${link.url}`,
      label: heatLinkLabel(link, index, finalsHeatSheetLinks.length, "Finals heat sheet"),
      url: link.url,
      icon: "lanes" as const,
      forcePdf: true,
      downloadName: meetFileName(
        heatLinkLabel(link, index, finalsHeatSheetLinks.length, "Finals Heat Sheet")
      ),
    })),
    ...(meet.swimphoneUrl
      ? [{ key: "swimphone", label: "SwimPhone results", url: meet.swimphoneUrl, icon: "trophy", external: true } as const]
      : []),
    ...(meet.resultsUrl
      ? [{ key: "results", label: "Results PDF", url: meet.resultsUrl, icon: "trophy", forcePdf: true, downloadName: meetFileName("Results") } as const]
      : []),
    ...(meet.liveStreamUrl
      ? [{ key: "live", label: "Live stream", url: meet.liveStreamUrl, icon: "broadcast" } as const]
      : []),
  ]
  const relaysHref = isCoach && !meetHasEnded ? `${meetPublicPath}/relays` : undefined
  const showPhotos =
    isBeforeOrToday && (initialPhotos.length > 0 || initialPreviews.length > 0 || isCoach)

  const highlightsCard = meetHighlights ? (
    <MeetHighlightsCarousel counters={meetHighlights.counters} />
  ) : null
  const countdownCard =
    isUpcomingMeet && meet.hasStartTime ? (
      <MeetCountdown
        startsAt={meetStartsAt}
        upcoming={false}
        variant="ledger"
      />
    ) : null
  const signupCard = showSignupSection ? (
    <MeetSignupSection
      meetPath={meetPublicPath}
      meetId={meet.id}
      eventOrder={meet.eventOrder}
      isCoach={isCoach}
      form={signupForm}
      myEntry={mySignupEntry}
      entries={signupEntries}
      hasImportedResults={hasImportedResults}
      variant="ledger"
    />
  ) : null
  const renderCompetitionCard = () =>
    hasResources || isCoach || relaysHref ? (
      <MeetCompetitionCard
        isCoach={isCoach}
        meetId={meet.id}
        season={meet.season}
        course={meet.course}
        resourceInitial={resourceInitial}
        linksBeforeOrder={linksBeforeOrder}
        linksAfterOrder={linksAfterOrder}
        eventOrder={eventOrder}
        relaysHref={relaysHref}
      />
    ) : null
  const travelCard =
    hasTravel || isCoach || showRoomSection ? (
      <MeetTravelCard
        isCoach={isCoach}
        meetId={meet.id}
        travelInitial={{
          rideSignUpsUrl: meet.rideSignUpsUrl ?? "",
          roomsUrl: meet.roomsUrl ?? "",
          hotel: meet.hotel ?? "",
          packingList: meet.packingList ?? "",
          itinerary: meet.itinerary ?? ""}}
        items={travelItems}
        hasRoomRows={showRoomSection}
        roomRows={
          showRoomSection ? (
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
              variant="ledger"
            />
          ) : null
        }
      />
    ) : null
  const photosCard = showPhotos ? (
    <MeetPhotosCard
      isCoach={isCoach}
      meetId={meet.id}
      photos={initialPhotos}
      previews={initialPreviews}
    />
  ) : null

  // Before any sheets exist: meet timing/people cards on the left, logistics on the right.
  // If one side is empty (e.g. a past meet with no sign-ups), move a card over so the
  // page doesn't render a blank half.
  const preSheetsLeft: ReactNode[] = [
    countdownCard && <Fragment key="countdown">{countdownCard}</Fragment>,
    highlightsCard && <Fragment key="highlights">{highlightsCard}</Fragment>,
    signupCard && <Fragment key="signup">{signupCard}</Fragment>,
  ].filter(Boolean)
  const preSheetsCompetition = renderCompetitionCard()
  const preSheetsRight: ReactNode[] = [
    preSheetsCompetition && <Fragment key="competition">{preSheetsCompetition}</Fragment>,
    travelCard && <Fragment key="travel">{travelCard}</Fragment>,
    photosCard && <Fragment key="photos">{photosCard}</Fragment>,
  ].filter(Boolean)
  if (preSheetsLeft.length === 0 && preSheetsRight.length > 1) {
    preSheetsLeft.push(preSheetsRight.shift())
  } else if (preSheetsRight.length === 0 && preSheetsLeft.length > 1) {
    preSheetsRight.unshift(preSheetsLeft.pop())
  }

  return (
    <div className="relative">
      {meet.bannerUrl && (
        <MeetPageBackground bannerUrl={meet.bannerUrl} />
      )}
      <main className="relative mx-auto max-w-[1240px]">
        <div className="relative z-10 flex flex-col gap-8">
          <div className="flex flex-col gap-4">{header}</div>
          {hasRosterSummaryContent ? (
            <MeetLedgerLayout
              ledger={
                <>
                  {highlightsCard}
                  {countdownCard}
                  {signupCard}
                  {renderCompetitionCard()}
                  {travelCard}
                  {photosCard}
                </>
              }
            >
              {summarySection}
            </MeetLedgerLayout>
          ) : (
            <MeetPreSheetsLayout left={preSheetsLeft} right={preSheetsRight} />
          )}
        </div>
      </main>
    </div>
  )
}

export default function MeetPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<LoadingComponent />}>
      <MeetPageContent {...props} />
    </Suspense>
  )
}
