import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"
import {
  attendanceDisplayName,
  findAthleteByGtid,
  normalizeGtid,
  serializeAttendance,
} from "@/lib/practice-attendance"

const attendanceInclude = {
  athlete: {
    select: {
      slug: true,
      firstName: true,
      lastName: true,
      gender: true,
      year: true,
      user: { select: { staffTitle: true } },
    },
  },
} as const

async function requireStaff() {
  const session = await getSession()
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!isStaffRole(session.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { session }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff()
  if (auth.error) return auth.error

  const { id } = await params
  const records = await prisma.practiceAttendance.findMany({
    where: { practiceId: id },
    include: attendanceInclude,
    orderBy: { recordedAt: "desc" },
  })
  return NextResponse.json({ attendance: records.map(serializeAttendance) })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff()
  if (auth.error) return auth.error
  const session = auth.session!

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const rawAthleteId = body.athleteId != null ? String(body.athleteId).trim() : ""
  const rawGtid = body.gtid != null ? String(body.gtid).trim() : ""
  const method: "SCAN" | "MANUAL" = rawAthleteId ? "MANUAL" : "SCAN"

  const scanned = rawAthleteId ? null : normalizeGtid(rawGtid)
  if (!rawAthleteId && !scanned) {
    return NextResponse.json({ error: "Scan a Buzzcard or enter a GTID" }, { status: 400 })
  }

  // Practice and athlete lookups are independent — run them concurrently
  // instead of one-after-another to keep check-in feeling instant.
  const [practice, athlete] = await Promise.all([
    prisma.practice.findUnique({ where: { id }, select: { id: true } }),
    rawAthleteId
      ? prisma.athlete.findUnique({
          where: { id: rawAthleteId },
          select: { id: true, firstName: true, lastName: true },
        })
      : findAthleteByGtid(scanned!),
  ])

  if (!practice) return NextResponse.json({ error: "Practice not found" }, { status: 404 })
  if (!athlete) {
    if (rawAthleteId) return NextResponse.json({ error: "Athlete not found" }, { status: 404 })
    return NextResponse.json(
      {
        error: `No roster athlete has GTID ${scanned}. Add it to their profile, or check them in by name.`,
        scanned,
        unknownGtid: true,
      },
      { status: 404 }
    )
  }

  // Attempt the write directly and let the unique constraint catch
  // duplicates, instead of a separate existence check first — halves the
  // round trips on the common (non-duplicate) path.
  try {
    const created = await prisma.practiceAttendance.create({
      data: {
        practiceId: id,
        athleteId: athlete.id,
        method,
        recordedById: session.user.id,
      },
      include: attendanceInclude,
    })
    return NextResponse.json(
      { duplicate: false, record: serializeAttendance(created) },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.practiceAttendance.findUnique({
        where: { practiceId_athleteId: { practiceId: id, athleteId: athlete.id } },
        include: attendanceInclude,
      })
      if (existing) {
        return NextResponse.json({
          duplicate: true,
          record: serializeAttendance(existing),
          message: `${attendanceDisplayName(athlete)} is already checked in.`,
        })
      }
    }
    throw err
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaff()
  if (auth.error) return auth.error

  const { id } = await params
  const athleteId = new URL(req.url).searchParams.get("athleteId")?.trim()
  if (!athleteId) {
    return NextResponse.json({ error: "Missing athleteId" }, { status: 400 })
  }

  await prisma.practiceAttendance.deleteMany({
    where: { practiceId: id, athleteId },
  })
  return NextResponse.json({ ok: true })
}
