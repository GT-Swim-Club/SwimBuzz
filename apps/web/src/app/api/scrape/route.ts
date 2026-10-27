import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { swimsFromSwimCloudTimes } from "@/lib/swim/swimcloud-import"
import { recordSwimCloudMeetSyncs, syncedSwimCloudMeets } from "@/lib/swim/swimcloud-meets"
import { mergeProfileTimes } from "@/lib/swim/swimcloud-profiles"
import { saveSwimCloudTimes, swimCloudProfileTimes } from "@/lib/swim/times-sync-partial"
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

type ScrapeApplyContext = {
  kind: "athlete_scrape"
  athleteId: string
  /** Every SwimCloud profile of the athlete, main first. */
  swimmerCloudIds: number[]
  /** Jobs queued before athletes could have two profiles. */
  swimmerCloudId?: number
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { athleteId } = await req.json()

  if (!athleteId || typeof athleteId !== "string") {
    return NextResponse.json({ error: "Missing athleteId" }, { status: 400 })
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { swimCloudIds: true },
  })
  if (!athlete) {
    return NextResponse.json({ error: "Athlete not found" }, { status: 404 })
  }
  const swimmerCloudIds = athlete.swimCloudIds
  if (swimmerCloudIds.length === 0) {
    return NextResponse.json({ error: "This athlete has no SwimCloud ID" }, { status: 400 })
  }

  try {
    const job = await enqueueScraperJob(
      session.user.id,
      ScraperJobType.TIMES_BULK,
      {
        swimmer_ids: swimmerCloudIds,
        synced_meets: await syncedSwimCloudMeets([athleteId]),
      },
      {
        kind: "athlete_scrape",
        athleteId,
        swimmerCloudIds,
      } satisfies ScrapeApplyContext
    )
    return NextResponse.json({ jobId: job.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json({ error: LOCAL_SCRAPER_HINT }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function applyAthleteScrapeJob(jobId: string, userId: string) {
  const job = await getScraperJobForUser(jobId, userId)
  if (!job) throw new Error("Job not found")
  if (job.status !== ScraperJobStatus.COMPLETED) {
    throw new Error(job.error ?? "Job is not complete")
  }
  if (job.appliedAt && job.applyResult) {
    const applied = job.applyResult as Record<string, unknown>
    if (typeof applied.error === "string") throw new Error(applied.error)
    return applied
  }

  const ctx = job.applyContext as ScrapeApplyContext | null
  if (!ctx || ctx.kind !== "athlete_scrape") {
    throw new Error("Invalid job context")
  }

  const scraped = job.result as {
    swimmers: Record<string, unknown>
    failed: number[]
  }

  const swimmerCloudIds =
    ctx.swimmerCloudIds ?? (ctx.swimmerCloudId != null ? [ctx.swimmerCloudId] : [])
  const succeeded = swimmerCloudIds.filter((id) => !scraped.failed?.includes(id))
  if (succeeded.length === 0) {
    const error = "SwimCloud scrape failed for this athlete"
    // Settle the job so a reload doesn't resume it and show this again.
    await markScraperJobApplied(jobId, { error })
    throw new Error(error)
  }

  const profiles = succeeded.map((swimmerId) => ({
    swimmerId,
    ...(swimCloudProfileTimes(scraped.swimmers?.[String(swimmerId)]) ?? { times: [], meetIds: [] }),
  }))
  const times = mergeProfileTimes(profiles.map((profile) => profile.times))
  const imported = await saveSwimCloudTimes(swimsFromSwimCloudTimes(times, ctx.athleteId))
  await recordSwimCloudMeetSyncs(ctx.athleteId, profiles.flatMap((profile) => profile.meetIds))

  const syncedAt = new Date()
  await prisma.athlete.update({
    where: { id: ctx.athleteId },
    data: { timesSyncedAt: syncedAt },
  })

  const summary = {
    imported,
    timesSyncedAt: syncedAt.toISOString(),
    failedSwimCloudIds: swimmerCloudIds.filter((id) => !succeeded.includes(id)),
  }
  await markScraperJobApplied(jobId, summary)
  return summary
}
