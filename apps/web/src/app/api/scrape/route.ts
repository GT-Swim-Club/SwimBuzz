import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { swimsFromSwimCloudTimes, type SwimCloudTime } from "@/lib/swimcloud-import"
import { assignSwimOccurrences } from "@/lib/swim-dedup"
import {
  enqueueScraperJob,
  getScraperJobForUser,
  markScraperJobApplied,
  LOCAL_SCRAPER_HINT,
} from "@/lib/scraper"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

export const runtime = "nodejs"
export const maxDuration = 300

type ScrapeApplyContext = {
  kind: "athlete_scrape"
  athleteId: string
  swimmerCloudId: number
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { athleteId, swimmerCloudId } = await req.json()

  if (!athleteId || !swimmerCloudId) {
    return NextResponse.json(
      { error: "Missing athleteId or swimmerCloudId" },
      { status: 400 }
    )
  }

  try {
    const job = await enqueueScraperJob(
      session.user.id,
      ScraperJobType.TIMES_BULK,
      { swimmer_ids: [swimmerCloudId] },
      {
        kind: "athlete_scrape",
        athleteId,
        swimmerCloudId: Number(swimmerCloudId),
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
    return job.applyResult as Record<string, unknown>
  }

  const ctx = job.applyContext as ScrapeApplyContext | null
  if (!ctx || ctx.kind !== "athlete_scrape") {
    throw new Error("Invalid job context")
  }

  const scraped = job.result as {
    swimmers: Record<string, SwimCloudTime[]>
    failed: number[]
  }

  if (scraped.failed?.includes(ctx.swimmerCloudId)) {
    throw new Error("SwimCloud scrape failed for this athlete")
  }

  const times = scraped.swimmers[String(ctx.swimmerCloudId)] ?? []
  const swims = assignSwimOccurrences(swimsFromSwimCloudTimes(times, ctx.athleteId))

  const result = await prisma.swim.createMany({
    data: swims,
    skipDuplicates: true,
  })

  const syncedAt = new Date()
  await prisma.athlete.update({
    where: { id: ctx.athleteId },
    data: { timesSyncedAt: syncedAt },
  })

  const summary = {
    imported: result.count,
    timesSyncedAt: syncedAt.toISOString(),
  }
  await markScraperJobApplied(jobId, summary)
  return summary
}
