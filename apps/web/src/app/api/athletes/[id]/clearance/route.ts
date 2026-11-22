import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import {
  athleteClearance,
  parseClearanceItemInput,
  serializeClearance,
  upsertClearanceQuery,
} from "@/lib/athlete/athlete-clearance"

/** Staff: an athlete's clearance (done once, not per season). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const athlete = await prisma.athlete.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!athlete) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ clearance: await athleteClearance(athlete.id) })
}

/** Staff: correct one athlete's clearance by hand. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const physical = parseClearanceItemInput(body?.physical)
  const concussion = parseClearanceItemInput(body?.concussion)
  if (physical === "invalid" || concussion === "invalid") {
    return NextResponse.json({ error: "Each check needs cleared (true/false)" }, { status: 400 })
  }
  if (!physical && !concussion) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const athlete = await prisma.athlete.findUnique({ where: { id }, select: { id: true } })
  if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 })

  const row = await upsertClearanceQuery(athlete.id, { physical, concussion }, "MANUAL")
  return NextResponse.json({ clearance: serializeClearance(row) })
}
