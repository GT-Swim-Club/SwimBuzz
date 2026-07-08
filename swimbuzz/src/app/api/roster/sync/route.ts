import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { Gender } from "@prisma/client"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { parseSeason, seasonEndYear } from "@/lib/season"
import {
  createImportAthlete,
  findAthleteForImport,
  loadRosterImportContext,
  mergeImportAthlete,
  parseSwimCloudName,
  registerImportAthlete,
  swimCloudIdConflict,
} from "@/lib/roster-import"

const TEAM_ID = process.env.SWIMCLOUD_TEAM_ID ?? "10004130"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { season: seasonRaw, year, gender } = await req.json()
  const season = parseSeason(seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  const swimCloudYear = seasonEndYear(season)
  const res = await fetchScraper(
    `${SCRAPER_URL}/roster?team_id=${TEAM_ID}&year=${swimCloudYear}&gender=${gender}`
  )
  if (!res.ok) {
    return NextResponse.json({ error: "Scraper failed" }, { status: 502 })
  }

  const roster = await res.json()
  console.log("[roster swimcloud import] sample:", roster[0])
  console.log("[roster swimcloud import] length:", roster.length)

  let created = 0
  let updated = 0
  const importGender = gender === "M" ? Gender.M : Gender.F

  try {
    const context = await loadRosterImportContext()

    for (const swimmer of roster) {
      const swimCloudId = parseInt(swimmer.swimmer_ID, 10)
      if (!swimCloudId || swimCloudId <= 0) continue

      const { firstName, lastName, nicknames } = parseSwimCloudName(swimmer.swimmer_name.trim())
      if (!firstName || !lastName) continue

      const input = {
        firstName,
        lastName,
        gender: importGender,
        swimCloudId,
        ...(nicknames.length > 0 ? { nicknames } : {}),
      }

      const existing = findAthleteForImport(input, context)
      const conflict = swimCloudIdConflict(input, existing, context)
      if (conflict) {
        console.warn(
          `[roster swimcloud import] SwimCloud ID ${swimCloudId} conflict for ${firstName} ${lastName}`
        )
        continue
      }

      if (existing) {
        const merged = await mergeImportAthlete(existing, input, season)
        registerImportAthlete(context, merged)
        updated++
        continue
      }

      const athlete = await createImportAthlete(input, season)
      registerImportAthlete(context, athlete)
      created++
    }
  } catch (err) {
    console.error("SwimCloud roster import failed:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  console.log("[roster swimcloud import] summary:", { created, updated, total: roster.length })

  return NextResponse.json({ created, updated, total: roster.length })
}
