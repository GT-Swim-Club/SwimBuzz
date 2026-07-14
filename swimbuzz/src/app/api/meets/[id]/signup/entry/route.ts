import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import {
  isSignupAnswers,
  isValidSignupEntryTime,
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTime,
  normalizeSignupEntryTimes,
  partitionSignupEvents,
  resolveSignupEventOptions,
  sortSignupEventsByOrder,
  signupWindowStatus,
  signupWithdrawStatus,
} from "@/lib/meet-signup"
import { Prisma } from "@prisma/client"

async function resolveLinkedAthleteId(
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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Coaches cannot edit athlete sign-ups." },
      { status: 403 }
    )
  }

  const body = await req.json()

  const target = await resolveLinkedAthleteId(session.user.id)
  if ("error" in target) {
    return NextResponse.json({ error: target.error }, { status: target.status })
  }
  const { athleteId } = target

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { eventOrder: true, signupForm: true },
  })
  if (!meet?.signupForm) {
    return NextResponse.json({ error: "Sign-ups are not set up for this meet" }, { status: 404 })
  }

  const form = meet.signupForm
  const window = signupWindowStatus({
    enabled: form.enabled,
    openAt: form.openAt,
    closeAt: form.closeAt,
  })
  if (!window.open) {
    return NextResponse.json({ error: window.reason ?? "Sign-ups are closed" }, { status: 403 })
  }

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const eventOptionNames = new Set(eventOptions.map((e) => e.event))
  if (eventOptionNames.size === 0) {
    return NextResponse.json(
      { error: "This meet has no order of events yet. Import the meet packet first." },
      { status: 400 }
    )
  }

  const events = Array.isArray(body.events)
    ? body.events
        .filter((e: unknown): e is string => typeof e === "string")
        .map((e: string) => e.trim())
        .filter(Boolean)
    : []

  if (events.length === 0) {
    return NextResponse.json({ error: "Select at least one event" }, { status: 400 })
  }
  const invalid = events.filter((e: string) => !eventOptionNames.has(e))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Invalid events: ${invalid.join(", ")}` }, { status: 400 })
  }

  const orderedEvents = sortSignupEventsByOrder(events, eventOptions)

  const { individual, relay } = partitionSignupEvents(orderedEvents)
  if (form.minEvents != null && individual.length < form.minEvents) {
    return NextResponse.json(
      {
        error: `Select at least ${form.minEvents} individual event${form.minEvents === 1 ? "" : "s"}`,
      },
      { status: 400 }
    )
  }
  if (form.maxEvents != null && individual.length > form.maxEvents) {
    return NextResponse.json(
      {
        error: `You can enter at most ${form.maxEvents} individual event${form.maxEvents === 1 ? "" : "s"}`,
      },
      { status: 400 }
    )
  }
  if (form.maxRelayEvents != null && relay.length > form.maxRelayEvents) {
    return NextResponse.json(
      {
        error: `You can enter at most ${form.maxRelayEvents} relay event${form.maxRelayEvents === 1 ? "" : "s"}`,
      },
      { status: 400 }
    )
  }

  const rawTimes = normalizeSignupEntryTimes(body.entryTimes)
  const entryTimes: Record<string, string> = {}
  for (const event of individual) {
    const time = rawTimes[event]?.trim() ?? ""
    if (!time) {
      return NextResponse.json({ error: `Enter a seed time for ${event}` }, { status: 400 })
    }
    if (!isValidSignupEntryTime(time)) {
      return NextResponse.json(
        { error: `Invalid time for ${event}. Use NT, or formats like 58.32 or 1:02.45` },
        { status: 400 }
      )
    }
    entryTimes[event] = normalizeSignupEntryTime(time)
  }

  const questions = normalizeMeetSignupQuestions(form.customQuestions)
  const rawAnswers = isSignupAnswers(body.answers) ? body.answers : {}
  const answers: Record<string, string> = {}
  for (const q of questions) {
    const value = String(rawAnswers[q.id] ?? "").trim()
    if (q.required && !value) {
      return NextResponse.json({ error: `"${q.label}" is required` }, { status: 400 })
    }
    if (q.type === "choice" && value && !q.options.includes(value)) {
      return NextResponse.json({ error: `Invalid answer for "${q.label}"` }, { status: 400 })
    }
    if (value) answers[q.id] = value
  }

  const notes =
    form.askNotes && typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : ""

  const entry = await prisma.meetSignupEntry.upsert({
    where: {
      formId_athleteId: { formId: form.id, athleteId },
    },
    create: {
      formId: form.id,
      athleteId,
      events: orderedEvents,
      entryTimes: entryTimes as Prisma.InputJsonValue,
      notes,
      answers: answers as Prisma.InputJsonValue,
    },
    update: {
      events: orderedEvents,
      entryTimes: entryTimes as Prisma.InputJsonValue,
      notes,
      answers: answers as Prisma.InputJsonValue,
    },
  })

  return NextResponse.json({
    id: entry.id,
    athleteId,
    events: entry.events,
    entryTimes: entry.entryTimes,
    notes: entry.notes,
    answers: entry.answers,
    updatedAt: entry.updatedAt.toISOString(),
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isCoach = ["COACH", "EXEC"].includes(session.user.role)
  const { id: meetId } = await params
  const form = await prisma.meetSignupForm.findUnique({ where: { meetId } })
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let athleteId: string
  if (isCoach) {
    const athleteIdParam = new URL(req.url).searchParams.get("athleteId")?.trim() ?? ""
    if (!athleteIdParam) {
      return NextResponse.json(
        { error: "athleteId is required to withdraw a sign-up" },
        { status: 400 }
      )
    }
    athleteId = athleteIdParam
  } else {
    const target = await resolveLinkedAthleteId(session.user.id)
    if ("error" in target) {
      return NextResponse.json({ error: target.error }, { status: target.status })
    }
    athleteId = target.athleteId

    const window = signupWithdrawStatus({
      enabled: form.enabled,
      openAt: form.openAt,
      closeAt: form.closeAt,
      withdrawUntil: form.withdrawUntil,
    })
    if (!window.allowed) {
      return NextResponse.json(
        { error: window.reason ?? "Withdrawals are closed" },
        { status: 403 }
      )
    }
  }

  const deleted = await prisma.meetSignupEntry.deleteMany({
    where: { formId: form.id, athleteId },
  })
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Sign-up not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
