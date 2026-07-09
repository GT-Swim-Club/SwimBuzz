import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { Gender } from "@prisma/client"
import { BridgeJobType } from "@prisma/client"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { parseSeason, seasonEndYear } from "@/lib/season"
import { runBridgeJob } from "@/lib/bridge"
import {
  applySwimCloudRosterImport,
  type SwimCloudRosterRow,
} from "@/lib/roster-import"

export const runtime = "nodejs"
export const maxDuration = 3600

const TEAM_ID = process.env.SWIMCLOUD_TEAM_ID ?? "10004130"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { season: seasonRaw, year, gender, useBridge } = await req.json()
  const season = parseSeason(seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  const importGender = gender === "F" ? Gender.F : Gender.M
  const swimCloudYear = seasonEndYear(season)
  let roster: SwimCloudRosterRow[]

  try {
    if (useBridge) {
      roster = await runBridgeJob<SwimCloudRosterRow[]>(session.user.id, BridgeJobType.ROSTER, {
        team_id: parseInt(TEAM_ID, 10),
        year: swimCloudYear,
        gender,
      })
    } else {
      const res = await fetchScraper(
        `${SCRAPER_URL}/roster?team_id=${TEAM_ID}&year=${swimCloudYear}&gender=${gender}`
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const detail = typeof err.detail === "string" ? err.detail : "Scraper failed"
        return NextResponse.json({ error: detail }, { status: 502 })
      }
      roster = await res.json()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json(
        {
          error:
            "Local sync is not connected. Open Local sync, generate a code, and run the bridge on your computer.",
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }

  console.log("[roster swimcloud import] sample:", roster[0])
  console.log("[roster swimcloud import] length:", roster.length)

  try {
    const { created, updated, total } = await applySwimCloudRosterImport(
      roster,
      season,
      importGender
    )
    console.log("[roster swimcloud import] summary:", { created, updated, total })
    return NextResponse.json({ created, updated, total })
  } catch (err) {
    console.error("SwimCloud roster import failed:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
