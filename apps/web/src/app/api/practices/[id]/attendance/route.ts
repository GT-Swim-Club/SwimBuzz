import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import {
  attendanceDisplayName,
  findAthleteByGtid,
  normalizeGtid,
  serializeAttendance,
} from "@/lib/practice/practice-attendance"
import { practiceSeason, withAttendanceClearance } from "@/lib/athlete/athlete-clearance"
import { canViewPractice, practiceAccessSelect, practiceViewer } from "@/lib/practice/practice-access"

const practiceSeasonSelect = { id: true, startsAt: true, createdAt: true, timeZone: true } as const

const attendanceInclude = {
  athlete: {
    select: {
      slug: true,
      firstName: true,
      lastName: true,
      gender: true,
      year: true,
      yearBySeason: true,
      seasons: true,
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

/**
 * Who's checked in. Staff and athletes alike may read a team practice they can view (the
 * same rule as the web attendance page); only staff records carry `uncleared`, the
 * clearance checks the athlete is missing (clearance is one-and-done, not per season).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const [practice, records] = await Promise.all([
    prisma.practice.findUnique({ where: { id }, select: { ...practiceSeasonSelect, ...practiceAccessSelect } }),
    prisma.practiceAttendance.findMany({
      where: { practiceId: id },
      include: attendanceInclude,
      orderBy: { recordedAt: "desc" },
    }),
  ])
  // Private practices have no attendance; athletes see only published team practices.
  if (!practice || practice.visibility !== "TEAM" || !canViewPractice(practice, practiceViewer(session))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  const season = practiceSeason(practice)
  const attendance = records.map(serializeAttendance)
  if (!isStaffRole(session.user.role)) return NextResponse.json({ attendance, season })
  return NextResponse.json({ attendance: await withAttendanceClearance(attendance), season })
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
    prisma.practice.findUnique({ where: { id, visibility: "TEAM" }, select: practiceSeasonSelect }),
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

  // Check-in never waits on clearance — it's looked up alongside the write and only flags the
  // record (and scan result) so staff see an athlete without a physical or concussion test.
  const flag = async (record: ReturnType<typeof serializeAttendance>) =>
    (await withAttendanceClearance([record]))[0]!

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
      { duplicate: false, record: await flag(serializeAttendance(created)) },
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
          record: await flag(serializeAttendance(existing)),
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
