import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizeMeetSignupQuestions } from "@/lib/meet-signup"
import { Prisma } from "@prisma/client"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"
import {
  loadMeetRoomContext,
  parseOptionalDate,
  resolveLinkedAthleteId,
  serializeRoomForm } from "./_shared"
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@swimbuzz/shared"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: meetId } = await params
  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isStaff = isStaffRole(session.user.role)
  const form = ctx.meet.roomForm
  const linked = await resolveLinkedAthleteId(session.user.id)
  const athleteId = "athleteId" in linked ? linked.athleteId : null

  const myPreference =
    form && athleteId
      ? form.preferences.find((p) => p.athleteId === athleteId) ?? null
      : null

  let myRoom: {
    label: string
    roommates: Array<{ id: string; firstName: string; lastName: string }>
  } | null = null

  if (form && athleteId && form.assignmentsPublishedAt) {
    for (const room of form.rooms) {
      const inRoom = room.assignments.find((a) => a.athleteId === athleteId)
      if (inRoom) {
        myRoom = {
          label: room.label,
          roommates: room.assignments
            .filter((a) => a.athleteId !== athleteId)
            .map((a) => ({
              id: a.athlete.id,
              firstName: a.athlete.firstName,
              lastName: a.athlete.lastName}))}
        break
      }
    }
  }

  return NextResponse.json({
    form: serializeRoomForm(form, {
      includePreferences: isStaff,
      includeRooms: isStaff || !!form?.assignmentsPublishedAt}),
    myPreference: myPreference
      ? {
          id: myPreference.id,
          preferredAthleteIds: myPreference.preferredAthleteIds,
          excludedAthleteIds: myPreference.excludedAthleteIds,
          notes: myPreference.notes,
          answers: myPreference.answers,
          updatedAt: myPreference.updatedAt.toISOString()}
      : null,
    myRoom: !isStaff || form?.assignmentsPublishedAt ? myRoom : null,
    athleteId,
    meetHasEnded: ctx.ended})
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({ where: { id: meetId }, select: { id: true, timeZone: true } })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const form = await prisma.meetRoomForm.upsert({
    where: { meetId },
    create: { meetId, timeZone: meet.timeZone ?? DEFAULT_TIME_ZONE },
    update: {}})

  return NextResponse.json({ id: form.id })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (ctx.ended) {
    return NextResponse.json({ error: "This meet has ended" }, { status: 403 })
  }

  const body = await req.json()
  const instructions =
    typeof body.instructions === "string" ? body.instructions.trim() : undefined

  let maxPreferences: number | undefined
  if (body.maxPreferences !== undefined) {
    const n = parseInt(String(body.maxPreferences), 10)
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      return NextResponse.json(
        { error: "Max preferences must be between 1 and 10" },
        { status: 400 }
      )
    }
    maxPreferences = n
  }

  const openAt = parseOptionalDate(body.openAt)
  const closeAt = parseOptionalDate(body.closeAt)
  if (openAt === undefined && body.openAt !== undefined) {
    return NextResponse.json({ error: "Invalid open date" }, { status: 400 })
  }
  if (closeAt === undefined && body.closeAt !== undefined) {
    return NextResponse.json({ error: "Invalid close date" }, { status: 400 })
  }

  const customQuestions =
    body.customQuestions !== undefined
      ? normalizeMeetSignupQuestions(body.customQuestions)
      : undefined

  let timeZone: string | undefined
  if (typeof body.timeZone === "string" && body.timeZone) {
    if (!isValidTimeZone(body.timeZone)) {
      return NextResponse.json({ error: "Time zone is invalid" }, { status: 400 })
    }
    timeZone = body.timeZone
  }

  const form = await prisma.meetRoomForm.upsert({
    where: { meetId },
    create: {
      meetId,
      timeZone: timeZone ?? DEFAULT_TIME_ZONE,
      ...(instructions !== undefined ? { instructions } : {}),
      ...(maxPreferences !== undefined ? { maxPreferences } : {}),
      ...(body.openAt !== undefined ? { openAt: openAt ?? null } : {}),
      ...(body.closeAt !== undefined ? { closeAt: closeAt ?? null } : {}),
      ...(customQuestions !== undefined
        ? { customQuestions: customQuestions as Prisma.InputJsonValue }
        : {})},
    update: {
      ...(instructions !== undefined ? { instructions } : {}),
      ...(maxPreferences !== undefined ? { maxPreferences } : {}),
      ...(timeZone !== undefined ? { timeZone } : {}),
      ...(body.openAt !== undefined ? { openAt: openAt ?? null } : {}),
      ...(body.closeAt !== undefined ? { closeAt: closeAt ?? null } : {}),
      ...(customQuestions !== undefined
        ? { customQuestions: customQuestions as Prisma.InputJsonValue }
        : {})}})

  return NextResponse.json({
    id: form.id,
    instructions: form.instructions,
    maxPreferences: form.maxPreferences,
    openAt: form.openAt?.toISOString() ?? null,
    closeAt: form.closeAt?.toISOString() ?? null,
    assignmentsPublishedAt: form.assignmentsPublishedAt?.toISOString() ?? null,
    customQuestions: normalizeMeetSignupQuestions(form.customQuestions),
    timeZone: form.timeZone})
}
