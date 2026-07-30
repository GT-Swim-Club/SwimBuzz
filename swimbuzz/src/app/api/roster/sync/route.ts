import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { Gender } from "@prisma/client"
import { BridgeJobType } from "@prisma/client"
import { parseSeason, seasonEndYear } from "@/lib/season"
import { runBridgeJob } from "@/lib/bridge"
import { LOCAL_BRIDGE_HINT } from "@/lib/scraper-or-bridge"
import {
  applySwimCloudRosterImport,
  type SwimCloudRosterRow,
} from "@/lib/roster-import"

export const runtime = "nodejs"
export const maxDuration = 3600

const TEAM_ID = process.env.SWIMCLOUD_TEAM_ID ?? "10004130"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { season: seasonRaw, year, gender } = await req.json()
  const season = parseSeason(seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  const swimCloudYear = seasonEndYear(season)
  const gendersToFetch = gender === "all" ? ["M", "F"] : [gender]
  const allSummary = { linked: 0, unmatched: 0, skippedConflict: 0, alreadyLinked: 0, total: 0 }

  try {
    for (const g of gendersToFetch) {
      const rosterRows = await runBridgeJob<SwimCloudRosterRow[]>(session.user.id, BridgeJobType.ROSTER, {
        team_id: parseInt(TEAM_ID, 10),
        year: swimCloudYear,
        gender: g,
      })
      
      const summary = await applySwimCloudRosterImport(
        rosterRows,
        season,
        g === "F" ? Gender.F : Gender.M
      )

      allSummary.linked += summary.linked
      allSummary.unmatched += summary.unmatched
      allSummary.skippedConflict += summary.skippedConflict
      allSummary.alreadyLinked += summary.alreadyLinked
      allSummary.total += summary.total
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json({ error: LOCAL_BRIDGE_HINT }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }

  console.log("[roster swimcloud ids] summary:", allSummary)
  return NextResponse.json(allSummary)
}
