import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Gender, ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { swimsFromSwimCloudTimes } from "@/lib/swim/swimcloud-import"
import { recordSwimCloudMeetSyncs, syncedSwimCloudMeets } from "@/lib/swim/swimcloud-meets"
import {
  asTimesApplyContext,
  saveSwimCloudTimes,
  swimCloudProfileTimes,
  type TimesApplyContext,
} from "@/lib/swim/times-sync-partial"
import {
  hasSwimCloudIdWhere,
  mergeProfileTimes,
} from "@/lib/swim/swimcloud-profiles"
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
      swimCloudIds: true,
      timesSyncedAt: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  return NextResponse.json({ athletes })
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
      ...hasSwimCloudIdWhere,
    },
    select: { id: true, firstName: true, lastName: true, swimCloudIds: true },
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

  const swimmerIds = athletes.flatMap((a) => a.swimCloudIds)
  const applyContext: TimesApplyContext = {
    kind: "times_sync",
    season,
    athleteIds: athletes.map((a) => a.id),
  }

  try {
    const job = await enqueueScraperJob(
      session.user.id,
      ScraperJobType.TIMES_BULK,
      { swimmer_ids: swimmerIds, synced_meets: await syncedSwimCloudMeets(athletes.map((a) => a.id)) },
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

  const ctx = asTimesApplyContext(job.applyContext)
  if (!ctx) {
    throw new Error("Invalid job context")
  }

  const athletes = await prisma.athlete.findMany({
    where: { id: { in: ctx.athleteIds }, ...hasSwimCloudIdWhere },
    select: { id: true, firstName: true, lastName: true, swimCloudIds: true },
  })
  const athleteBySwimCloudId = new Map(
    athletes.flatMap((a) => a.swimCloudIds.map((id) => [id, a] as const))
  )

  const scraped = job.result as {
    swimmers: Record<string, unknown>
    failed: number[]
  }

  const allSwims: ReturnType<typeof swimsFromSwimCloudTimes> = []
  const syncedAthleteIds: string[] = []
  const meetSyncs: { athleteId: string; meetIds: number[] }[] = []

  for (const athlete of athletes) {
    // An athlete with several SwimCloud profiles gets the times from all of them.
    const profiles = athlete.swimCloudIds.flatMap((swimmerId) => {
      const profile = swimCloudProfileTimes(scraped.swimmers?.[String(swimmerId)])
      return profile ? [{ swimmerId, ...profile }] : []
    })
    meetSyncs.push({ athleteId: athlete.id, meetIds: profiles.flatMap((profile) => profile.meetIds) })
    const withTimes = profiles.filter((profile) => profile.times.length > 0)
    if (withTimes.length === 0) continue
    allSwims.push(...swimsFromSwimCloudTimes(mergeProfileTimes(withTimes.map((p) => p.times)), athlete.id))
    syncedAthleteIds.push(athlete.id)
  }
  // Profiles the app saved as they streamed in come back as { streamed: true }, without their swims.
  for (const id of ctx.saved?.athleteIds ?? []) {
    if (!syncedAthleteIds.includes(id)) syncedAthleteIds.push(id)
  }
  const athletesSynced = syncedAthleteIds.length

  // Athletes the scraper streamed in while running are already saved; this pass only adds what's missing.
  const imported = (ctx.saved?.imported ?? 0) + (await saveSwimCloudTimes(allSwims))
  for (const { athleteId, meetIds } of meetSyncs) {
    await recordSwimCloudMeetSyncs(athleteId, meetIds)
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
    if (!athlete) return `SwimCloud ID ${id}`
    const name = `${athlete.firstName} ${athlete.lastName}`
    return athlete.swimCloudIds.length > 1 ? `${name} (SwimCloud ID ${id})` : name
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
