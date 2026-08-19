import BackLink from "@/components/BackLink"
import { Gender } from "@prisma/client"
import { notFound, redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { resolveViewerAthleteId } from "@/lib/athlete-view-server"
import { collectMeetRosterAthleteIds } from "@/lib/meet-sheet-summary"
import { isSignupAnswers, normalizeMeetSignupQuestions } from "@/lib/meet-signup"
import MeetRoomPreferenceForm from "../MeetRoomPreferenceForm"

export default async function MeetRoommatePreferencePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/signin?callbackUrl=/meets/${encodeURIComponent(param)}/roommate`)
  }
  const viewerAthleteId = await resolveViewerAthleteId(session.user.id)
  if (!viewerAthleteId) redirect(`/meets/${encodeURIComponent(param)}`)

  const meet = await prisma.meet.findFirst({
    where: { OR: [{ id: param }, { slug: param }] },
    select: {
      id: true,
      slug: true,
      name: true,
      location: true,
      season: true,
      startDate: true,
      endDate: true,
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      swims: { select: { athleteId: true } },
      signupForm: { select: { entries: { select: { athleteId: true } } } },
      roomForm: {
        select: {
          instructions: true,
          maxPreferences: true,
          openAt: true,
          closeAt: true,
          customQuestions: true,
          preferences: {
            where: { athleteId: viewerAthleteId },
            select: {
              preferredAthleteIds: true,
              excludedAthleteIds: true,
              notes: true,
              answers: true,
            },
          },
        },
      },
    },
  })

  if (!meet) notFound()
  const meetPath = `/meets/${meet.slug ?? meet.id}`
  if (meet.slug && param !== meet.slug) redirect(`${meetPath}/roommate`)
  if (!meet.roomForm) redirect(meetPath)

  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const lastActiveDate = new Date(meet.endDate ?? meet.startDate)
  lastActiveDate.setHours(0, 0, 0, 0)
  if (lastActiveDate <= yesterday) redirect(meetPath)

  const seasonRoster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, gender: true },
  })
  const rosterIds = new Set(
    collectMeetRosterAthleteIds({
      psychSheetSummary: meet.psychSheetSummary,
      heatSheetSummary: meet.heatSheetSummary,
      finalsHeatSheetSummary: meet.finalsHeatSheetSummary,
      entriesSheetSummary: meet.entriesSheetSummary,
      relayResultsSummary: meet.relayResultsSummary,
      resultStatusesSummary: meet.resultStatusesSummary,
      swimAthleteIds: meet.swims.map((swim) => swim.athleteId),
      signupAthleteIds: meet.signupForm?.entries.map((entry) => entry.athleteId),
    })
  )
  if (!rosterIds.has(viewerAthleteId)) redirect(meetPath)

  const athletes = seasonRoster
    .filter((athlete) => rosterIds.has(athlete.id))
    .map((athlete) => ({
      id: athlete.id,
      name: `${athlete.lastName}, ${athlete.firstName}`,
      gender: athlete.gender === Gender.F ? ("F" as const) : ("M" as const),
    }))
  const preference = meet.roomForm.preferences[0] ?? null

  return (
    <main className="mx-auto max-w-3xl flex flex-col gap-6 py-2 sm:py-4">
      <BackLink
        fallbackHref={meetPath}
        fallbackLabel={meet.name}
        className="self-start -mb-5 inline-flex items-center gap-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
      />
      <header>
        <h1 className="text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
          {meet.name}
        </h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Roommate preferences
        </p>
        {meet.location && (
          <p className="mt-2 text-sm text-foreground-secondary">
            {meet.location}
          </p>
        )}
      </header>
      <MeetRoomPreferenceForm
        meetId={meet.id}
        maxPreferences={meet.roomForm.maxPreferences}
        instructions={meet.roomForm.instructions}
        customQuestions={normalizeMeetSignupQuestions(meet.roomForm.customQuestions)}
        openAt={meet.roomForm.openAt?.toISOString() ?? null}
        closeAt={meet.roomForm.closeAt?.toISOString() ?? null}
        isCoach={false}
        selfAthleteId={viewerAthleteId}
        athletes={athletes}
        myPreference={
          preference
            ? {
                preferredAthleteIds: preference.preferredAthleteIds,
                excludedAthleteIds: preference.excludedAthleteIds,
                notes: preference.notes,
                answers: isSignupAnswers(preference.answers) ? preference.answers : {},
              }
            : null
        }
        pageMode
      />
    </main>
  )
}
