"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeMeetSignupQuestions, parseCustomQuestionAnswers } from "@/lib/meet/meet-signup"
import { getSession } from "@/lib/auth/session"
import { DEFAULT_TIME_ZONE, isValidTimeZone, isStaffRole } from "@swimbuzz/shared"
import {
  normalizeRoomNotes,
  roomWindowStatus,
  validateRoomExclusions,
  validateRoomPreferences,
  formatRoomLabel,
  validateRoomAssignmentsAgainstExclusions,
} from "@/lib/meet/meet-rooms"
import {
  formatAthleteName,
  loadMeetRoomContext,
  resolveLinkedAthleteId,
  toGender,
} from "@/app/api/meets/[id]/rooms/_shared"

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return undefined
  return d
}

export type SaveMeetRoomConfigInput = {
  isNew: boolean
  instructions: string
  maxPreferences: number
  timeZone: string
  openAt: string | null
  closeAt: string | null
  customQuestions: unknown
}

/** Same logic as POST + PATCH /api/meets/[id]/rooms — kept in sync manually
 * since the route can't be refactored without risking the mobile-facing
 * contract. */
export async function saveMeetRoomConfig(meetId: string, input: SaveMeetRoomConfigInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { id: true, timeZone: true }})
  if (!meet) throw new Error("Not found")

  if (input.isNew) {
    await prisma.meetRoomForm.upsert({
      where: { meetId },
      create: { meetId, timeZone: meet.timeZone ?? DEFAULT_TIME_ZONE },
      update: {}})
  }

  const instructions = input.instructions.trim()

  if (!Number.isFinite(input.maxPreferences) || input.maxPreferences < 1 || input.maxPreferences > 10) {
    throw new Error("Max preferences must be between 1 and 10")
  }

  const openAt = parseOptionalDate(input.openAt)
  const closeAt = parseOptionalDate(input.closeAt)
  if (openAt === undefined && input.openAt !== undefined) throw new Error("Invalid open date")
  if (closeAt === undefined && input.closeAt !== undefined) throw new Error("Invalid close date")

  const customQuestions = normalizeMeetSignupQuestions(input.customQuestions)

  let timeZone: string | undefined
  if (typeof input.timeZone === "string" && input.timeZone) {
    if (!isValidTimeZone(input.timeZone)) throw new Error("Time zone is invalid")
    timeZone = input.timeZone
  }

  const form = await prisma.meetRoomForm.upsert({
    where: { meetId },
    create: {
      meetId,
      timeZone: timeZone ?? DEFAULT_TIME_ZONE,
      instructions,
      maxPreferences: input.maxPreferences,
      openAt: openAt ?? null,
      closeAt: closeAt ?? null,
      customQuestions: customQuestions as Prisma.InputJsonValue},
    update: {
      instructions,
      maxPreferences: input.maxPreferences,
      ...(timeZone !== undefined ? { timeZone } : {}),
      openAt: openAt ?? null,
      closeAt: closeAt ?? null,
      customQuestions: customQuestions as Prisma.InputJsonValue}})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/roommates", "page")
  return {
    id: form.id,
    instructions: form.instructions,
    maxPreferences: form.maxPreferences,
    openAt: form.openAt?.toISOString() ?? null,
    closeAt: form.closeAt?.toISOString() ?? null,
    assignmentsPublishedAt: form.assignmentsPublishedAt?.toISOString() ?? null,
    customQuestions: normalizeMeetSignupQuestions(form.customQuestions),
    timeZone: form.timeZone}
}

export type SaveRoomPreferenceInput = {
  preferredAthleteIds: string[]
  excludedAthleteIds: string[]
  notes: string
  answers: Record<string, string>
}

/** Same logic as PUT /api/meets/[id]/rooms/preference — kept in sync
 * manually since the route can't be refactored without risking the
 * mobile-facing contract. */
export async function saveRoomPreference(meetId: string, input: SaveRoomPreferenceInput) {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")
  if (session.user.role === "COACH") {
    throw new Error("Coaches cannot submit roommate preferences.")
  }

  const target = await resolveLinkedAthleteId(session.user.id)
  if ("error" in target) throw new Error(target.error)
  const { athleteId } = target

  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx?.meet.roomForm) throw new Error("Roommate preferences are not set up for this meet")
  if (ctx.ended) throw new Error("This meet has ended")

  const form = ctx.meet.roomForm
  const window = roomWindowStatus({ openAt: form.openAt, closeAt: form.closeAt })
  if (!window.open) throw new Error(window.reason ?? "Preferences are closed")

  const self = ctx.roster.find((a) => a.id === athleteId)
  if (!self) throw new Error("You are not on the roster for this meet")

  const preferredAthleteIds = Array.isArray(input.preferredAthleteIds) ? input.preferredAthleteIds : []
  const excludedAthleteIds = Array.isArray(input.excludedAthleteIds) ? input.excludedAthleteIds : []

  const roster = ctx.roster.map((a) => ({
    id: a.id,
    name: formatAthleteName(a),
    gender: toGender(a.gender)}))

  const validatedPreferred = validateRoomPreferences({
    preferredAthleteIds,
    roster,
    selfId: athleteId,
    selfGender: toGender(self.gender),
    maxPreferences: form.maxPreferences})
  if (!validatedPreferred.ok) throw new Error(validatedPreferred.error)

  const validatedExcluded = validateRoomExclusions({
    excludedAthleteIds,
    roster,
    selfId: athleteId,
    selfGender: toGender(self.gender),
    maxExclusions: form.maxPreferences,
    forbiddenIds: new Set(validatedPreferred.ids)})
  if (!validatedExcluded.ok) throw new Error(validatedExcluded.error)

  const notes = normalizeRoomNotes(input.notes)

  const questions = normalizeMeetSignupQuestions(form.customQuestions)
  const parsedAnswers = parseCustomQuestionAnswers(questions, input.answers)
  if (!parsedAnswers.ok) throw new Error(parsedAnswers.error)

  await prisma.meetRoomPreference.upsert({
    where: { formId_athleteId: { formId: form.id, athleteId } },
    create: {
      formId: form.id,
      athleteId,
      preferredAthleteIds: validatedPreferred.ids,
      excludedAthleteIds: validatedExcluded.ids,
      notes,
      answers: parsedAnswers.answers as Prisma.InputJsonValue},
    update: {
      preferredAthleteIds: validatedPreferred.ids,
      excludedAthleteIds: validatedExcluded.ids,
      notes,
      answers: parsedAnswers.answers as Prisma.InputJsonValue}})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/roommate", "page")
  return { ok: true }
}

type RoomInput = { athleteIds: string[] }

/** Same logic as PUT /api/meets/[id]/rooms/assignments — kept in sync
 * manually since the route can't be refactored without risking the
 * mobile-facing contract. */
export async function saveRoomAssignments(meetId: string, rooms: RoomInput[]) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) throw new Error("Not found")
  if (!ctx.meet.roomForm) throw new Error("Roommate form not set up")
  if (ctx.ended) throw new Error("This meet has ended")

  const rosterIds = new Set(ctx.roster.map((a) => a.id))
  const rosterGenderById = new Map(ctx.roster.map((athlete) => [athlete.id, athlete.gender]))
  const assigned = new Set<string>()

  for (const room of rooms) {
    const athleteIds = Array.isArray(room.athleteIds)
      ? room.athleteIds.filter((id): id is string => typeof id === "string")
      : []
    let roomGender: (typeof ctx.roster)[number]["gender"] | undefined
    for (const athleteId of athleteIds) {
      if (!rosterIds.has(athleteId)) throw new Error("Athlete must be on this meet's roster")
      if (assigned.has(athleteId)) throw new Error("Each athlete can only be in one room")
      const athleteGender = rosterGenderById.get(athleteId)
      if (!athleteGender) throw new Error("Athlete gender is required for room assignment")
      if (roomGender && athleteGender !== roomGender) {
        throw new Error("A room can only include athletes of the same gender")
      }
      roomGender = athleteGender
      assigned.add(athleteId)
    }
  }

  const preferences = ctx.meet.roomForm.preferences.map((p) => ({
    athleteId: p.athleteId,
    preferredAthleteIds: p.preferredAthleteIds,
    excludedAthleteIds: p.excludedAthleteIds}))
  const exclusionCheck = validateRoomAssignmentsAgainstExclusions(rooms, preferences)
  if (!exclusionCheck.ok) throw new Error(exclusionCheck.error)

  const formId = ctx.meet.roomForm.id

  await prisma.$transaction(async (tx) => {
    await tx.meetRoom.deleteMany({ where: { formId } })
    for (let i = 0; i < rooms.length; i++) {
      const athleteIds = Array.isArray(rooms[i].athleteIds)
        ? rooms[i].athleteIds.filter((id): id is string => typeof id === "string")
        : []
      if (athleteIds.length === 0) continue

      const created = await tx.meetRoom.create({
        data: { formId, label: formatRoomLabel(i + 1), sortOrder: i }})

      await tx.meetRoomAssignment.createMany({
        data: athleteIds.map((athleteId) => ({ roomId: created.id, athleteId }))})
    }
  })

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/roommates", "page")
  return { ok: true }
}

/** Same logic as PATCH /api/meets/[id]/rooms/publish. */
export async function toggleRoomPublish(meetId: string, published: boolean) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) throw new Error("Not found")
  if (!ctx.meet.roomForm) throw new Error("Roommate form not set up")
  if (ctx.ended) throw new Error("This meet has ended")

  if (published && ctx.meet.roomForm.rooms.length === 0) {
    throw new Error("Add at least one athlete to a room before publishing")
  }

  const form = await prisma.meetRoomForm.update({
    where: { id: ctx.meet.roomForm.id },
    data: { assignmentsPublishedAt: published ? new Date() : null }})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/roommates", "page")
  return { assignmentsPublishedAt: form.assignmentsPublishedAt?.toISOString() ?? null }
}
