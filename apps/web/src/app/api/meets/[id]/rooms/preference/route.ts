import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import {
  normalizeRoomNotes,
  roomWindowStatus,
  validateRoomExclusions,
  validateRoomPreferences } from "@/lib/meet/meet-rooms"
import {
  normalizeMeetSignupQuestions,
  parseCustomQuestionAnswers } from "@/lib/meet/meet-signup"
import { getSession } from "@/lib/auth/session"
import {
  formatAthleteName,
  loadMeetRoomContext,
  resolveLinkedAthleteId,
  toGender } from "../_shared"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (session.user.role === "COACH") {
    return NextResponse.json(
      { error: "Coaches cannot submit roommate preferences." },
      { status: 403 }
    )
  }

  const target = await resolveLinkedAthleteId(session.user.id)
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: target.status })
  }
  const { athleteId } = target

  const { id: meetId } = await params
  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx?.meet.roomForm) {
    return NextResponse.json({ error: "Roommate preferences are not set up for this meet" }, { status: 404 })
  }
  if (ctx.ended) {
    return NextResponse.json({ error: "This meet has ended" }, { status: 403 })
  }

  const form = ctx.meet.roomForm
  const window = roomWindowStatus({ openAt: form.openAt, closeAt: form.closeAt })
  if (!window.open) {
    return NextResponse.json({ error: window.reason ?? "Preferences are closed" }, { status: 403 })
  }

  const self = ctx.roster.find((a) => a.id === athleteId)
  if (!self) {
    return NextResponse.json({ error: "You are not on the roster for this meet" }, { status: 400 })
  }

  const body = await req.json()
  const preferredAthleteIds = Array.isArray(body.preferredAthleteIds)
    ? body.preferredAthleteIds
    : []
  const excludedAthleteIds = Array.isArray(body.excludedAthleteIds)
    ? body.excludedAthleteIds
    : []

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
  if (!validatedPreferred.ok) {
    return NextResponse.json({ error: validatedPreferred.error }, { status: 400 })
  }

  const validatedExcluded = validateRoomExclusions({
    excludedAthleteIds,
    roster,
    selfId: athleteId,
    selfGender: toGender(self.gender),
    maxExclusions: form.maxPreferences,
    forbiddenIds: new Set(validatedPreferred.ids)})
  if (!validatedExcluded.ok) {
    return NextResponse.json({ error: validatedExcluded.error }, { status: 400 })
  }

  const validated = validatedPreferred

  const notes = normalizeRoomNotes(body.notes)

  const questions = normalizeMeetSignupQuestions(form.customQuestions)
  const parsedAnswers = parseCustomQuestionAnswers(questions, body.answers)
  if (!parsedAnswers.ok) {
    return NextResponse.json({ error: parsedAnswers.error }, { status: 400 })
  }

  const entry = await prisma.meetRoomPreference.upsert({
    where: {
      formId_athleteId: { formId: form.id, athleteId }},
    create: {
      formId: form.id,
      athleteId,
      preferredAthleteIds: validated.ids,
      excludedAthleteIds: validatedExcluded.ids,
      notes,
      answers: parsedAnswers.answers as Prisma.InputJsonValue},
    update: {
      preferredAthleteIds: validated.ids,
      excludedAthleteIds: validatedExcluded.ids,
      notes,
      answers: parsedAnswers.answers as Prisma.InputJsonValue}})

  return NextResponse.json({
    id: entry.id,
    athleteId,
    preferredAthleteIds: entry.preferredAthleteIds,
    excludedAthleteIds: entry.excludedAthleteIds,
    notes: entry.notes,
    answers: entry.answers,
    updatedAt: entry.updatedAt.toISOString()})
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isCoach = session.user.role === "COACH"
  const { id: meetId } = await params
  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx?.meet.roomForm) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const form = ctx.meet.roomForm
  let athleteId: string

  if (isCoach) {
    const athleteIdParam = new URL(req.url).searchParams.get("athleteId")?.trim() ?? ""
    if (!athleteIdParam) {
      return NextResponse.json({ error: "athleteId is required" }, { status: 400 })
    }
    athleteId = athleteIdParam
  } else {
    if (ctx.ended) {
      return NextResponse.json({ error: "This meet has ended" }, { status: 403 })
    }
    const window = roomWindowStatus({ openAt: form.openAt, closeAt: form.closeAt })
    if (!window.open) {
      return NextResponse.json({ error: window.reason ?? "Preferences are closed" }, { status: 403 })
    }
    const target = await resolveLinkedAthleteId(session.user.id)
    if ("error" in target) {
      return NextResponse.json({ error: target.error }, { status: target.status })
    }
    athleteId = target.athleteId
  }

  const deleted = await prisma.meetRoomPreference.deleteMany({
    where: { formId: form.id, athleteId }})
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Preference not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
