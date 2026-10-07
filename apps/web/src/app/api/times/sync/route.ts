import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Gender, ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { assignSwimOccurrences } from "@/lib/swim/swim-dedup"
import { swimsFromSwimCloudTimes, type SwimCloudTime } from "@/lib/swim/swimcloud-import"
import { parseSeason } from "@/lib/season"
import {
  enqueueScraperJob,
  getScraperJobForUser,
  markScraperJobApplied,
  LOCAL_SCRAPER_HINT,
} from "@/lib/scraper/scraper"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const params = new URL(req.url).searchParams
  const season = parseSeason(params.get("season") ?? params.get("year"))
  const genderRaw = params.get("gender")
  const gender = genderRaw === "all" ? undefined : (genderRaw === "F" ? Gender.F : Gender.M)

  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025–2026)" }, { status: 400 })
  }

  const athletes = await prisma.athlete.findMany({
    where: {
      seasons: { has: season },
      ...(gender ? { gender } : {}),
    },
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

type TimesApplyContext = {
  kind: "times_sync"
  season: string
  athleteIds: string[]
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { season: seasonRaw, year, gender: genderRaw, athleteIds } = await req.json()
  const season = parseSeason(seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025–2026)" }, { status: 400 })
  }
  const gender = genderRaw === "all" ? undefined : (genderRaw === "F" ? Gender.F : Gender.M)
  if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
    return NextResponse.json({ error: "Select at least one athlete" }, { status: 400 })
  }

  const athletes = await prisma.athlete.findMany({
    where: {
      id: { in: athleteIds },
      seasons: { has: season },
      ...(gender ? { gender } : {}),
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
  const applyContext: TimesApplyContext = {
    kind: "times_sync",
    season,
    athleteIds: athletes.map((a) => a.id),
  }

  try {
    const job = await enqueueScraperJob(
      session.user.id,
      ScraperJobType.TIMES_BULK,
      { swimmer_ids: swimmerIds },
      applyContext
    )
    return NextResponse.json({ jobId: job.id, athletes: athletes.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Run scraper failed"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json({ error: LOCAL_SCRAPER_HINT }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function applyTimesSyncJob(jobId: string, userId: string) {
  const job = await getScraperJobForUser(jobId, userId)
  if (!job) throw new Error("Job not found")
  if (job.status !== ScraperJobStatus.COMPLETED) {
    throw new Error(job.error ?? "Job is not complete")
  }
  if (job.appliedAt && job.applyResult) {
    return job.applyResult as Record<string, unknown>
  }

  const ctx = job.applyContext as TimesApplyContext | null
  if (!ctx || ctx.kind !== "times_sync") {
    throw new Error("Invalid job context")
  }

  const athletes = await prisma.athlete.findMany({
    where: { id: { in: ctx.athleteIds }, swimCloudId: { not: null } },
    select: { id: true, firstName: true, lastName: true, swimCloudId: true },
  })
  const athleteBySwimCloudId = new Map(athletes.map((a) => [a.swimCloudId!, a]))

  const scraped = job.result as {
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

  const summary = {
    imported,
    parsed: allSwims.length,
    athletes: athletes.length,
    athletesSynced,
    syncedAthleteIds,
    timesSyncedAt: syncedAt.toISOString(),
    failed,
  }

  await markScraperJobApplied(jobId, summary)
  return summary
}
