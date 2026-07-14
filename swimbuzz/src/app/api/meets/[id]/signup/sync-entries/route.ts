import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import {
  isSignupEntryTimes,
  mergeSignupIndividualsIntoEntriesSummary,
  resolveSignupEventOptions,
  type SignupEntryForSheetSync,
} from "@/lib/meet-signup"
import { isSheetSummary } from "@/lib/meet-sheet-summary"
import { Prisma } from "@prisma/client"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      course: true,
      eventOrder: true,
      entriesSheetSummary: true,
      signupForm: {
        select: {
          entries: {
            select: {
              athleteId: true,
              events: true,
              entryTimes: true,
              athlete: {
                select: { firstName: true, lastName: true, gender: true },
              },
            },
          },
        },
      },
    },
  })

  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })
  if (!meet.signupForm) {
    return NextResponse.json({ error: "Sign-up form not set up" }, { status: 404 })
  }

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  if (eventOptions.length === 0) {
    return NextResponse.json(
      { error: "Import a meet packet so the order of events is available." },
      { status: 400 }
    )
  }

  const signups: SignupEntryForSheetSync[] = meet.signupForm.entries.map((entry) => ({
    athleteId: entry.athleteId,
    athleteName: `${entry.athlete.lastName}, ${entry.athlete.firstName}`,
    gender: entry.athlete.gender,
    events: entry.events,
    entryTimes: isSignupEntryTimes(entry.entryTimes) ? entry.entryTimes : {},
  }))

  const existing = isSheetSummary(meet.entriesSheetSummary)
    ? meet.entriesSheetSummary
    : null
  const { summary, synced } = mergeSignupIndividualsIntoEntriesSummary(
    existing,
    meet.course,
    signups,
    eventOptions
  )

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue },
  })

  return NextResponse.json({
    synced,
    athletes: signups.length,
  })
}
