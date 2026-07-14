import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import {
  deleteManualIndividualSheetEntry,
  findSignupEventOption,
  isValidSignupEntryTime,
  normalizeSignupEntryTime,
  resolveSignupEventOptions,
  updateManualIndividualSheetEntry,
} from "@/lib/meet-signup"
import { isSheetSummary } from "@/lib/meet-sheet-summary"
import { Prisma } from "@prisma/client"

export const runtime = "nodejs"

function parseBody(body: unknown): {
  athleteId: string
  event: string
  newEvent?: string
  seedTime?: string
} | null {
  if (!body || typeof body !== "object") return null
  const raw = body as Record<string, unknown>
  const athleteId = String(raw.athleteId ?? "").trim()
  const event = String(raw.event ?? "").trim()
  if (!athleteId || !event) return null
  const newEvent =
    raw.newEvent != null ? String(raw.newEvent).trim() || undefined : undefined
  const seedTime =
    raw.seedTime != null ? String(raw.seedTime).trim() || undefined : undefined
  return { athleteId, event, newEvent, seedTime }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const body = parseBody(await req.json())
  if (!body) {
    return NextResponse.json({ error: "athleteId and event are required" }, { status: 400 })
  }

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      course: true,
      eventOrder: true,
      entriesSheetSummary: true,
    },
  })
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const nextEvent = body.newEvent ?? body.event
  if (eventOptions.length > 0 && !findSignupEventOption(nextEvent, eventOptions)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 })
  }

  const seedTimeRaw = body.seedTime ?? "NT"
  const seedNormalized = normalizeSignupEntryTime(seedTimeRaw)
  if (!/^nt$/i.test(seedNormalized) && !isValidSignupEntryTime(seedNormalized)) {
    return NextResponse.json(
      { error: "Enter a valid seed time (e.g. 58.32 or 1:02.15) or NT" },
      { status: 400 }
    )
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: body.athleteId },
    select: { id: true, firstName: true, lastName: true, gender: true },
  })
  if (!athlete) {
    return NextResponse.json({ error: "Athlete not found" }, { status: 404 })
  }

  const existing = isSheetSummary(meet.entriesSheetSummary)
    ? meet.entriesSheetSummary
    : null
  const { summary, found, conflict } = updateManualIndividualSheetEntry(
    existing,
    meet.course,
    {
      athleteId: body.athleteId,
      event: body.event,
      newEvent: nextEvent,
      seedTime: seedNormalized,
      athleteName: `${athlete.lastName}, ${athlete.firstName}`,
      gender: athlete.gender === "F" ? "F" : athlete.gender === "M" ? "M" : null,
      eventOptions,
    }
  )

  if (!found) {
    return NextResponse.json(
      { error: "That sign-up roster entry was not found (imported sheet rows cannot be edited)." },
      { status: 404 }
    )
  }
  if (conflict) {
    return NextResponse.json(
      { error: "Athlete already has that event on the roster summary." },
      { status: 409 }
    )
  }

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const body = parseBody(await req.json().catch(() => null))
  if (!body) {
    return NextResponse.json({ error: "athleteId and event are required" }, { status: 400 })
  }

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { course: true, entriesSheetSummary: true },
  })
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  const existing = isSheetSummary(meet.entriesSheetSummary)
    ? meet.entriesSheetSummary
    : null
  const { summary, found } = deleteManualIndividualSheetEntry(existing, meet.course, {
    athleteId: body.athleteId,
    event: body.event,
  })

  if (!found) {
    return NextResponse.json(
      { error: "That sign-up roster entry was not found (imported sheet rows cannot be deleted)." },
      { status: 404 }
    )
  }

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue },
  })

  return NextResponse.json({ ok: true })
}
