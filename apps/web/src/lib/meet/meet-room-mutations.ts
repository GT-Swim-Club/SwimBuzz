import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { normalizeRoomNotes, validateRoomExclusions, validateRoomPreferences } from "@/lib/meet/meet-rooms"
import { isSignupAnswers, normalizeMeetSignupQuestions, parseCustomQuestionAnswers } from "@/lib/meet/meet-signup"
import { formatAthleteName, loadMeetRoomContext, toGender } from "@/app/api/meets/[id]/rooms/_shared"

/**
 * Staff-on-behalf write path for roommate preferences — the only existing
 * write path (MeetRoomPreferenceForm.actions.ts / the PUT route) refuses
 * COACH outright, since it's meant for an athlete editing their own
 * preferences. This carve-out is used by the Google Form response import.
 */

export class RoomActionError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type RoomPreferenceInputData = {
  preferredAthleteIds?: unknown
  excludedAthleteIds?: unknown
  notes?: unknown
  answers?: unknown
}

type ValidatedRoomPreferenceData = {
  preferredAthleteIds: string[]
  excludedAthleteIds: string[]
  notes: string
  answers: Record<string, string>
  warnings: string[]
}

async function loadValidatedRoomPreferenceData(
  formId: string,
  athleteId: string,
  data: RoomPreferenceInputData
): Promise<{ formId: string; validated: ValidatedRoomPreferenceData }> {
  const form = await prisma.meetRoomForm.findUnique({
    where: { id: formId },
    select: { meetId: true, maxPreferences: true, customQuestions: true }})
  if (!form) throw new RoomActionError("Roommate preference form not found", 404)

  const ctx = await loadMeetRoomContext(form.meetId)
  if (!ctx) throw new RoomActionError("Meet not found", 404)

  const self = ctx.roster.find((a) => a.id === athleteId)
  if (!self) throw new RoomActionError("Athlete is not on the roster for this meet", 400)

  const roster = ctx.roster.map((a) => ({ id: a.id, name: formatAthleteName(a), gender: toGender(a.gender) }))
  const selfGender = toGender(self.gender)
  const sameGenderIds = new Set(roster.filter((a) => a.gender === selfGender).map((a) => a.id))

  const warnings: string[] = []
  const rawPreferred = Array.isArray(data.preferredAthleteIds) ? data.preferredAthleteIds : []
  const rawExcluded = Array.isArray(data.excludedAthleteIds) ? data.excludedAthleteIds : []

  const validatedPreferred = validateRoomPreferences({
    preferredAthleteIds: rawPreferred,
    roster,
    selfId: athleteId,
    selfGender,
    maxPreferences: form.maxPreferences})
  let preferredAthleteIds: string[]
  if (!validatedPreferred.ok) {
    warnings.push(validatedPreferred.error)
    preferredAthleteIds = [
      ...new Set(
        rawPreferred.filter(
          (id): id is string => typeof id === "string" && id !== athleteId && sameGenderIds.has(id)
        )
      ),
    ].slice(0, form.maxPreferences)
  } else {
    preferredAthleteIds = validatedPreferred.ids
  }

  const validatedExcluded = validateRoomExclusions({
    excludedAthleteIds: rawExcluded,
    roster,
    selfId: athleteId,
    selfGender,
    maxExclusions: form.maxPreferences,
    forbiddenIds: new Set(preferredAthleteIds)})
  let excludedAthleteIds: string[]
  if (!validatedExcluded.ok) {
    warnings.push(validatedExcluded.error)
    excludedAthleteIds = [
      ...new Set(
        rawExcluded.filter(
          (id): id is string =>
            typeof id === "string" &&
            id !== athleteId &&
            sameGenderIds.has(id) &&
            !preferredAthleteIds.includes(id)
        )
      ),
    ].slice(0, form.maxPreferences)
  } else {
    excludedAthleteIds = validatedExcluded.ids
  }

  const notes = normalizeRoomNotes(data.notes)

  const questions = normalizeMeetSignupQuestions(form.customQuestions)
  const parsedAnswers = parseCustomQuestionAnswers(questions, data.answers)
  let answers: Record<string, string>
  if (!parsedAnswers.ok) {
    warnings.push(parsedAnswers.error)
    answers = isSignupAnswers(data.answers) ? data.answers : {}
  } else {
    answers = parsedAnswers.answers
  }

  return { formId, validated: { preferredAthleteIds, excludedAthleteIds, notes, answers, warnings } }
}

/** Staff-only: preview the warnings a room-preference import row would produce without writing anything. */
export async function previewRoomPreferenceForAthlete(
  formId: string,
  athleteId: string,
  data: RoomPreferenceInputData
): Promise<{ warnings: string[] }> {
  const { validated } = await loadValidatedRoomPreferenceData(formId, athleteId, data)
  return { warnings: validated.warnings }
}

/** Staff-only: upsert a roommate preference for an explicit athlete, bypassing the open/close window. */
export async function upsertRoomPreferenceForAthlete(
  formId: string,
  athleteId: string,
  data: RoomPreferenceInputData
): Promise<{ entry: { id: string; updatedAt: string }; warnings: string[] }> {
  const { validated } = await loadValidatedRoomPreferenceData(formId, athleteId, data)

  const entry = await prisma.meetRoomPreference.upsert({
    where: { formId_athleteId: { formId, athleteId } },
    create: {
      formId,
      athleteId,
      preferredAthleteIds: validated.preferredAthleteIds,
      excludedAthleteIds: validated.excludedAthleteIds,
      notes: validated.notes,
      answers: validated.answers as Prisma.InputJsonValue},
    update: {
      preferredAthleteIds: validated.preferredAthleteIds,
      excludedAthleteIds: validated.excludedAthleteIds,
      notes: validated.notes,
      answers: validated.answers as Prisma.InputJsonValue}})

  return {
    entry: { id: entry.id, updatedAt: entry.updatedAt.toISOString() },
    warnings: validated.warnings}
}
