import BackLink from "@/components/BackLink"
import { Gender } from "@prisma/client"
import { athletePreferredNameLastFirst } from "@swimbuzz/shared"
import { notFound, redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/prisma"
import { isStaffUi } from "@/lib/athlete-view-server"
import { collectMeetRosterAthleteIds } from "@/lib/meet-sheet-summary"
import {
  isSignupAnswers,
  normalizeMeetSignupQuestions,
} from "@/lib/meet-signup"
import MeetRoommateManager from "./MeetRoommateManager"

export default async function MeetRoommateManagerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/signin?callbackUrl=/meets/${encodeURIComponent(param)}/roommates`)
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
      createdAt: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      swims: { select: { athleteId: true } },
      signupForm: { select: { entries: { select: { athleteId: true } } } },
      roomForm: {
        include: {
          preferences: {
            include: {
              athlete: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  nicknames: true,
                  gender: true,
                },
              },
            },
            orderBy: [
              { athlete: { lastName: "asc" } },
              { athlete: { firstName: "asc" } },
            ],
          },
          rooms: {
            include: {
              assignments: { select: { athleteId: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  })

  if (!meet) notFound()
  const meetPath = `/meets/${meet.slug ?? meet.id}`
  if (meet.slug && param !== meet.slug) redirect(`${meetPath}/roommates`)

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
  const athletes = seasonRoster
    .filter((athlete) => rosterIds.has(athlete.id))
    .map((athlete) => ({
      id: athlete.id,
      name: athletePreferredNameLastFirst(athlete),
      gender: athlete.gender === Gender.F ? ("F" as const) : ("M" as const),
    }))
  const form = meet.roomForm

  return (
    <main className="mx-auto w-full max-w-6xl flex flex-col gap-6 py-2 sm:py-4">
      <BackLink
        fallbackHref={meetPath}
        fallbackLabel={meet.name}
        className="self-start -mb-5 inline-flex items-center gap-2 text-sm font-medium text-foreground-secondary transition-colors hover:text-foreground"
      />
      <MeetRoommateManager
        meetId={meet.id}
        meetName={meet.name}
        meetTimeZone={meet.timeZone}
        configInitial={
          form
            ? {
                instructions: form.instructions,
                maxPreferences: form.maxPreferences,
                openAt: form.openAt?.toISOString() ?? null,
                closeAt: form.closeAt?.toISOString() ?? null,
                customQuestions: normalizeMeetSignupQuestions(
                  form.customQuestions
                ),
                timeZone: form.timeZone,
              }
            : null
        }
        athletes={athletes}
        questions={normalizeMeetSignupQuestions(form?.customQuestions)}
        preferences={(form?.preferences ?? []).map((preference) => ({
          athleteId: preference.athleteId,
          firstName: preference.athlete.firstName,
          lastName: preference.athlete.lastName,
          nicknames: preference.athlete.nicknames,
          preferredAthleteIds: preference.preferredAthleteIds,
          excludedAthleteIds: preference.excludedAthleteIds,
          notes: preference.notes,
          answers: isSignupAnswers(preference.answers)
            ? preference.answers
            : {},
        }))}
        rooms={(form?.rooms ?? []).map((room) => ({
          athleteIds: room.assignments.map((assignment) => assignment.athleteId),
        }))}
        assignmentsPublishedAt={
          form?.assignmentsPublishedAt?.toISOString() ?? null
        }
        meetHasEnded={false}
      />
    </main>
  )
}
