"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  normalizeRoomNotes,
  roomWindowStatus,
  validateRoomExclusions,
  validateRoomPreferences } from "@/lib/meet-rooms"
import { normalizeMeetSignupQuestions, parseCustomQuestionAnswers } from "@/lib/meet-signup"
import { getSession } from "@/lib/session"
import {
  formatAthleteName,
  loadMeetRoomContext,
  resolveLinkedAthleteId,
  toGender } from "@/app/api/meets/[id]/rooms/_shared"

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
