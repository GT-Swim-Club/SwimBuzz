import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"
import { parseSeason } from "@/lib/season"
import { setNationalsMeet } from "@/lib/qualifiers/nationals-meet"

/** Links a meet as the season's Nationals (its order of events numbers the Nationals page), or clears it. */
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const season = parseSeason(typeof body?.season === "string" ? body.season : null)
  if (!season) return NextResponse.json({ error: "Valid season is required" }, { status: 400 })
  const meetId = typeof body?.meetId === "string" && body.meetId ? body.meetId : null

  if (meetId) {
    const meet = await prisma.meet.findUnique({ where: { id: meetId }, select: { season: true } })
    if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })
    if (meet.season !== season) {
      return NextResponse.json({ error: "Pick a meet from this season" }, { status: 400 })
    }
  }

  await setNationalsMeet(season, meetId)
  return NextResponse.json({ ok: true, meetId })
}
