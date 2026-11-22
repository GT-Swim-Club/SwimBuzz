import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { listSeasonClearance } from "@/lib/athlete/athlete-clearance"
import { currentSeason, parseSeason } from "@/lib/season"

/** Staff: every athlete on a season's roster with their physical & concussion clearance (not per season). */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isStaffRole(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const raw = new URL(req.url).searchParams.get("season")
  const season = raw ? parseSeason(raw) : currentSeason()
  if (!season) return NextResponse.json({ error: "Invalid season" }, { status: 400 })

  return NextResponse.json(await listSeasonClearance(season))
}
