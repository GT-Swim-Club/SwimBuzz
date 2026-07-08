import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { Gender } from "@prisma/client"
import { assignSwimOccurrences } from "@/lib/swim-dedup"
import { swimsFromSwimCloudTimes, type SwimCloudTime } from "@/lib/swimcloud-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { parseSeason } from "@/lib/season"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const params = new URL(req.url).searchParams
  const season = parseSeason(params.get("season") ?? params.get("year"))
  const gender = params.get("gender") === "F" ? Gender.F : Gender.M

  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: season }, gender },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      swimCloudId: true,
      timesSyncedAt: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  return NextResponse.json({ athletes })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { season: seasonRaw, year, gender: genderRaw, athleteIds } = await req.json()
  const season = parseSeason(seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }
  const gender = genderRaw === "F" ? Gender.F : Gender.M
  if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
    return NextResponse.json({ error: "Select at least one athlete" }, { status: 400 })
  }

  const athletes = await prisma.athlete.findMany({
    where: {
      id: { in: athleteIds },
      seasons: { has: season },
      gender,
      swimCloudId: { not: null },
    },
    select: { id: true, firstName: true, lastName: true, swimCloudId: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  if (athletes.length === 0) {
    return NextResponse.json({
      imported: 0,
      athletes: 0,
      athletesSynced: 0,
      failed: [],
      message: "No selected athletes have a SwimCloud ID",
    })
  }

  const swimmerIds = athletes.map((a) => a.swimCloudId!)
  const athleteBySwimCloudId = new Map(
    athletes.map((a) => [a.swimCloudId!, a])
  )

  let scrapeRes: Response
  try {
    scrapeRes = await fetchScraper(`${SCRAPER_URL}/times/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ swimmer_ids: swimmerIds }),
    })
  } catch {
    return NextResponse.json(
      { error: "Could not reach scraper — is it running on port 8000?" },
      { status: 502 }
    )
  }

  if (!scrapeRes.ok) {
    const err = await scrapeRes.json().catch(() => ({}))
    return NextResponse.json(
      { error: err.detail ?? "Scraper failed" },
      { status: 502 }
    )
  }

  const scraped = (await scrapeRes.json()) as {
    swimmers: Record<string, SwimCloudTime[]>
    failed: number[]
  }

  const allSwims: ReturnType<typeof swimsFromSwimCloudTimes> = []
  const syncedAthleteIds: string[] = []

  for (const [swimCloudIdStr, times] of Object.entries(scraped.swimmers ?? {})) {
    const athlete = athleteBySwimCloudId.get(parseInt(swimCloudIdStr, 10))
    if (!athlete || !times?.length) continue
    allSwims.push(...swimsFromSwimCloudTimes(times, athlete.id))
    syncedAthleteIds.push(athlete.id)
  }
  const athletesSynced = syncedAthleteIds.length

  const swimsToInsert = assignSwimOccurrences(allSwims)
  let imported = 0
  const chunkSize = 500
  for (let i = 0; i < swimsToInsert.length; i += chunkSize) {
    const chunk = swimsToInsert.slice(i, i + chunkSize)
    const result = await prisma.swim.createMany({
      data: chunk,
      skipDuplicates: true,
    })
    imported += result.count
  }

  const syncedAt = new Date()
  if (syncedAthleteIds.length > 0) {
    await prisma.athlete.updateMany({
      where: { id: { in: syncedAthleteIds } },
      data: { timesSyncedAt: syncedAt },
    })
  }

  const failed = (scraped.failed ?? []).map((id) => {
    const athlete = athleteBySwimCloudId.get(id)
    return athlete
      ? `${athlete.firstName} ${athlete.lastName}`
      : `SwimCloud ID ${id}`
  })

  console.log(
    `\n--- SwimCloud sync (${season}): ${athletesSynced}/${athletes.length} athletes, ${imported} new swims ---\n`
  )

  return NextResponse.json({
    imported,
    parsed: allSwims.length,
    athletes: athletes.length,
    athletesSynced,
    syncedAthleteIds,
    timesSyncedAt: syncedAt.toISOString(),
    failed,
  })
}
