import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import {
  normalizeMeetSignupQuestions,
  resolveSignupEventOptions,
  signupWindowStatus,
} from "@/lib/meet-signup"
import { notifyMeetSignupOpen } from "@/lib/notifications"
import { Prisma } from "@prisma/client"

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      eventOrder: true,
      signupForm: {
        include: {
          entries: {
            include: {
              athlete: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  gender: true,
                },
              },
            },
            orderBy: [{ updatedAt: "desc" }],
          },
        },
      },
    },
  })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isCoach = session.user.role === "COACH"
  const form = meet.signupForm
  const athlete = await prisma.athlete.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  const myEntry =
    form && athlete
      ? form.entries.find((e) => e.athleteId === athlete.id) ?? null
      : null

  return NextResponse.json({
        form: form
      ? {
          id: form.id,
          enabled: form.enabled,
          instructions: form.instructions,
          minEvents: form.minEvents,
          maxEvents: form.maxEvents,
          maxRelayEvents: form.maxRelayEvents,
          askNotes: form.askNotes,
          customQuestions: normalizeMeetSignupQuestions(form.customQuestions),
          openAt: form.openAt?.toISOString() ?? null,
          closeAt: form.closeAt?.toISOString() ?? null,
          withdrawUntil: form.withdrawUntil?.toISOString() ?? null,
          eventOptions: resolveSignupEventOptions(meet.eventOrder),
          window: signupWindowStatus({
            enabled: form.enabled,
            openAt: form.openAt,
            closeAt: form.closeAt,
          }),
        }
      : null,
    myEntry: myEntry
      ? {
          id: myEntry.id,
          events: myEntry.events,
          notes: myEntry.notes,
          answers: myEntry.answers,
          updatedAt: myEntry.updatedAt.toISOString(),
        }
      : null,
    athleteId: athlete?.id ?? null,
    entries: isCoach && form
      ? form.entries.map((e) => ({
          id: e.id,
          athleteId: e.athleteId,
          firstName: e.athlete.firstName,
          lastName: e.athlete.lastName,
          gender: e.athlete.gender,
          events: e.events,
          notes: e.notes,
          answers: e.answers,
          updatedAt: e.updatedAt.toISOString(),
        }))
      : undefined,
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      eventOrder: true,
      signupForm: { select: { enabled: true } },
    },
  })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (resolveSignupEventOptions(meet.eventOrder).length === 0) {
    return NextResponse.json(
      { error: "Must have an order of events to set up a sign-up form." },
      { status: 400 }
    )
  }

  const wasEnabled = meet.signupForm?.enabled === true

  const body = await req.json()
  const enabled = Boolean(body.enabled)
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : ""
  const askNotes = body.askNotes !== false

  let minEvents: number | null = null
  if (body.minEvents === null || body.minEvents === "") {
    minEvents = null
  } else if (body.minEvents !== undefined) {
    const n = parseInt(String(body.minEvents), 10)
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "Min individual events must be a positive number" },
        { status: 400 }
      )
    }
    minEvents = n
  }

  let maxEvents: number | null = null
  if (body.maxEvents === null || body.maxEvents === "") {
    maxEvents = null
  } else if (body.maxEvents !== undefined) {
    const n = parseInt(String(body.maxEvents), 10)
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "Max individual events must be a positive number" },
        { status: 400 }
      )
    }
    maxEvents = n
  }

  if (minEvents != null && maxEvents != null && minEvents > maxEvents) {
    return NextResponse.json(
      { error: "Min individual events cannot be greater than max" },
      { status: 400 }
    )
  }

  let maxRelayEvents: number | null = null
  if (body.maxRelayEvents === null || body.maxRelayEvents === "") {
    maxRelayEvents = null
  } else if (body.maxRelayEvents !== undefined) {
    const n = parseInt(String(body.maxRelayEvents), 10)
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "Max relay events must be a positive number" },
        { status: 400 }
      )
    }
    maxRelayEvents = n
  }

  const openAt = parseOptionalDate(body.openAt)
  const closeAt = parseOptionalDate(body.closeAt)
  const withdrawUntil = parseOptionalDate(body.withdrawUntil)
  if (openAt === undefined && body.openAt !== undefined) {
    return NextResponse.json({ error: "Invalid open date" }, { status: 400 })
  }
  if (closeAt === undefined && body.closeAt !== undefined) {
    return NextResponse.json({ error: "Invalid close date" }, { status: 400 })
  }
  if (withdrawUntil === undefined && body.withdrawUntil !== undefined) {
    return NextResponse.json({ error: "Invalid withdraw deadline" }, { status: 400 })
  }
  if (
    closeAt != null &&
    withdrawUntil != null &&
    withdrawUntil < closeAt
  ) {
    return NextResponse.json(
      { error: "Withdraw deadline must be on or after the signup close time" },
      { status: 400 }
    )
  }

  const customQuestions = normalizeMeetSignupQuestions(body.customQuestions)

  const data = {
    enabled,
    instructions,
    // Events always come from meet event order — keep this empty.
    allowedEvents: [] as string[],
    minEvents,
    maxEvents,
    maxRelayEvents,
    askNotes,
    customQuestions: customQuestions as Prisma.InputJsonValue,
    ...(body.openAt !== undefined ? { openAt: openAt ?? null } : {}),
    ...(body.closeAt !== undefined ? { closeAt: closeAt ?? null } : {}),
    ...(body.withdrawUntil !== undefined ? { withdrawUntil: withdrawUntil ?? null } : {}),
  }

  const form = await prisma.meetSignupForm.upsert({
    where: { meetId },
    create: { meetId, ...data },
    update: data,
  })

  if (enabled && !wasEnabled) {
    const window = signupWindowStatus({
      enabled: form.enabled,
      openAt: form.openAt,
      closeAt: form.closeAt,
    })
    if (window.open) {
      await notifyMeetSignupOpen({
        meetId: meet.id,
        meetName: meet.name,
      })
    }
  }

  return NextResponse.json({
    id: form.id,
    enabled: form.enabled,
    instructions: form.instructions,
    minEvents: form.minEvents,
    maxEvents: form.maxEvents,
    maxRelayEvents: form.maxRelayEvents,
    askNotes: form.askNotes,
    customQuestions: normalizeMeetSignupQuestions(form.customQuestions),
    openAt: form.openAt?.toISOString() ?? null,
    closeAt: form.closeAt?.toISOString() ?? null,
    withdrawUntil: form.withdrawUntil?.toISOString() ?? null,
  })
}
