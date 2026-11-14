import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import {
  athleteClearanceBySeason,
  canSeeAthleteClearance,
  parseClearanceItemInput,
  serializeClearance,
  upsertClearanceQuery,
} from "@/lib/athlete/athlete-clearance"
import { parseSeason } from "@/lib/season"

/** An athlete's clearance for each season they're on — staff or the athlete themself. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const athlete = await prisma.athlete.findUnique({
    where: { id },
    select: { id: true, userId: true, seasons: true },
  })
  // Same answer for "not found" and "not yours", so ids can't be probed.
  if (!athlete || !canSeeAthleteClearance(session, athlete)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json({ seasons: await athleteClearanceBySeason(athlete.id, athlete.seasons) })
}

/** Staff: correct one athlete's clearance for a season by hand. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const season = parseSeason(body?.season)
  if (!season) return NextResponse.json({ error: "Invalid season" }, { status: 400 })
  const physical = parseClearanceItemInput(body?.physical)
  const concussion = parseClearanceItemInput(body?.concussion)
  if (physical === "invalid" || concussion === "invalid") {
    return NextResponse.json({ error: "Each check needs cleared (true/false) and an optional YYYY-MM-DD date" }, { status: 400 })
  }
  if (!physical && !concussion) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const athlete = await prisma.athlete.findUnique({ where: { id }, select: { id: true } })
  if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 })

  const row = await upsertClearanceQuery(athlete.id, season, { physical, concussion }, "MANUAL")
  return NextResponse.json({ clearance: serializeClearance(row, season) })
}
