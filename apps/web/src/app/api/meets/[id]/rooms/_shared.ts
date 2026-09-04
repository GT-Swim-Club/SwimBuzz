import { prisma } from "@/lib/prisma"
import { Gender, Prisma } from "@prisma/client"
import { collectMeetRosterAthleteIds } from "@/lib/meet/meet-sheet-summary"
import { meetHasEnded, roomWindowStatus } from "@/lib/meet/meet-rooms"
import { normalizeMeetSignupQuestions } from "@/lib/meet/meet-signup"

export function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return undefined
  return d
}

export async function resolveLinkedAthleteId(
  sessionUserId: string
): Promise<{ athleteId: string } | { error: string; status: number }> {
  const linked = await prisma.athlete.findUnique({
    where: { userId: sessionUserId },
    select: { id: true },
  })
  if (linked) return { athleteId: linked.id }
  return {
    error: "Your account is not linked to a roster athlete. Ask a coach to add you.",
    status: 400,
  }
}

export function formatAthleteName(a: { firstName: string; lastName: string }): string {
  return `${a.lastName}, ${a.firstName}`
}

export function toGender(g: Gender): "M" | "F" {
  return g === Gender.F ? "F" : "M"
}

type MeetRosterSource = {
  psychSheetSummary?: unknown
  heatSheetSummary?: unknown
  finalsHeatSheetSummary?: unknown
  entriesSheetSummary?: unknown
  relayResultsSummary?: unknown
  resultStatusesSummary?: unknown
  swims?: { athleteId: string }[]
  signupForm?: { entries: { athleteId: string }[] } | null
}

export function collectMeetRosterIdsFromMeet(meet: MeetRosterSource): Set<string> {
  return new Set(
    collectMeetRosterAthleteIds({
      psychSheetSummary: meet.psychSheetSummary,
      heatSheetSummary: meet.heatSheetSummary,
      finalsHeatSheetSummary: meet.finalsHeatSheetSummary,
      entriesSheetSummary: meet.entriesSheetSummary,
      relayResultsSummary: meet.relayResultsSummary,
      resultStatusesSummary: meet.resultStatusesSummary,
      swimAthleteIds: meet.swims?.map((s) => s.athleteId) ?? [],
      signupAthleteIds: meet.signupForm?.entries.map((e) => e.athleteId) ?? [],
    })
  )
}

export async function loadMeetRoomContext(meetId: string) {
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      season: true,
      createdAt: true,
      startsAt: true,
      endsAt: true,
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
                select: { id: true, firstName: true, lastName: true, gender: true },
              },
            },
            orderBy: [{ updatedAt: "desc" }],
          },
          rooms: {
            include: {
              assignments: {
                include: {
                  athlete: {
                    select: { id: true, firstName: true, lastName: true, gender: true },
                  },
                },
              },
            },
            orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          },
        },
      },
    },
  })
  if (!meet) return null

  const seasonRoster = await prisma.athlete.findMany({
    where: { seasons: { has: meet.season } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, gender: true },
  })

  const meetRosterIds = collectMeetRosterIdsFromMeet(meet)
  const roster = seasonRoster.filter((a) => meetRosterIds.has(a.id))

  const ended = meetHasEnded({
    startsAt: meet.startsAt ?? meet.createdAt,
    endsAt: meet.endsAt,
  })

  return { meet, roster, ended }
}

export function serializeRoomForm(
  form: NonNullable<Awaited<ReturnType<typeof loadMeetRoomContext>>>["meet"]["roomForm"],
  opts: { includePreferences: boolean; includeRooms: boolean }
) {
  if (!form) return null
  return {
    id: form.id,
    instructions: form.instructions,
    maxPreferences: form.maxPreferences,
    openAt: form.openAt?.toISOString() ?? null,
    closeAt: form.closeAt?.toISOString() ?? null,
    assignmentsPublishedAt: form.assignmentsPublishedAt?.toISOString() ?? null,
    customQuestions: normalizeMeetSignupQuestions(form.customQuestions),
    timeZone: form.timeZone,
    window: roomWindowStatus({ openAt: form.openAt, closeAt: form.closeAt }),
    preferences: opts.includePreferences
      ? form.preferences.map((p) => ({
          id: p.id,
          athleteId: p.athleteId,
          firstName: p.athlete.firstName,
          lastName: p.athlete.lastName,
          gender: toGender(p.athlete.gender),
          preferredAthleteIds: p.preferredAthleteIds,
          excludedAthleteIds: p.excludedAthleteIds,
          notes: p.notes,
          answers: p.answers,
          updatedAt: p.updatedAt.toISOString(),
        }))
      : undefined,
    rooms: opts.includeRooms
      ? form.rooms.map((r) => ({
          id: r.id,
          label: r.label,
          sortOrder: r.sortOrder,
          athleteIds: r.assignments.map((a) => a.athleteId),
          athletes: r.assignments.map((a) => ({
            id: a.athleteId,
            firstName: a.athlete.firstName,
            lastName: a.athlete.lastName,
            gender: toGender(a.athlete.gender),
          })),
        }))
      : undefined,
  }
}
