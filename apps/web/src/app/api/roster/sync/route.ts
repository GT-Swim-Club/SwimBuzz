import { NextResponse } from "next/server"
import { Gender, ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { parseSeason, seasonEndYear } from "@/lib/season"
import {
  enqueueScraperJob,
  getScraperJobForUser,
  markScraperJobApplied,
  LOCAL_SCRAPER_HINT,
} from "@/lib/scraper/scraper"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"
import {
  applySwimCloudRosterImport,
  type SwimCloudRosterRow,
} from "@/lib/roster/roster-import"

export const runtime = "nodejs"
export const maxDuration = 300

const TEAM_ID = process.env.SWIMCLOUD_TEAM_ID ?? "10004130"

type RosterSummary = {
  linked: number
  unmatched: number
  skippedConflict: number
  alreadyLinked: number
  total: number
}

type RosterApplyContext = {
  kind: "roster_sync"
  season: string
  genders: string[]
  genderIndex: number
  summary: RosterSummary
}

function emptySummary(): RosterSummary {
  return { linked: 0, unmatched: 0, skippedConflict: 0, alreadyLinked: 0, total: 0 }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { season: seasonRaw, year, gender } = await req.json()
  const season = parseSeason(seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  const swimCloudYear = seasonEndYear(season)
  const gendersToFetch = gender === "all" ? ["M", "F"] : [gender === "F" ? "F" : "M"]
  const g = gendersToFetch[0]

  const applyContext: RosterApplyContext = {
    kind: "roster_sync",
    season,
    genders: gendersToFetch,
    genderIndex: 0,
    summary: emptySummary(),
  }

  try {
    const job = await enqueueScraperJob(
      session.user.id,
      ScraperJobType.ROSTER,
      {
        team_id: parseInt(TEAM_ID, 10),
        year: swimCloudYear,
        gender: g,
      },
      applyContext
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

export async function applyRosterSyncJob(jobId: string, userId: string) {
  const job = await getScraperJobForUser(jobId, userId)
  if (!job) throw new Error("Job not found")
  if (job.status !== ScraperJobStatus.COMPLETED) {
    throw new Error(job.error ?? "Job is not complete")
  }
  if (job.appliedAt && job.applyResult) {
    return job.applyResult as Record<string, unknown>
  }

  const ctx = job.applyContext as RosterApplyContext | null
  if (!ctx || ctx.kind !== "roster_sync") {
    throw new Error("Invalid job context")
  }

  const g = ctx.genders[ctx.genderIndex]
  const rosterRows = (job.result ?? []) as SwimCloudRosterRow[]
  const summary = await applySwimCloudRosterImport(
    rosterRows,
    ctx.season,
    g === "F" ? Gender.F : Gender.M
  )

  const allSummary: RosterSummary = {
    linked: ctx.summary.linked + summary.linked,
    unmatched: ctx.summary.unmatched + summary.unmatched,
    skippedConflict: ctx.summary.skippedConflict + summary.skippedConflict,
    alreadyLinked: ctx.summary.alreadyLinked + summary.alreadyLinked,
    total: ctx.summary.total + summary.total,
  }

  const nextIndex = ctx.genderIndex + 1
  if (nextIndex < ctx.genders.length) {
    const nextGender = ctx.genders[nextIndex]
    const swimCloudYear = seasonEndYear(ctx.season)
    const nextJob = await enqueueScraperJob(
      userId,
      ScraperJobType.ROSTER,
      {
        team_id: parseInt(TEAM_ID, 10),
        year: swimCloudYear,
        gender: nextGender,
      },
      {
        kind: "roster_sync",
        season: ctx.season,
        genders: ctx.genders,
        genderIndex: nextIndex,
        summary: allSummary,
      } satisfies RosterApplyContext
    )
    // Mark this job applied so retries don't double-import; client continues on nextJobId.
    await markScraperJobApplied(jobId, {
      ...allSummary,
      done: false,
      nextJobId: nextJob.id,
    })
    return { ...allSummary, done: false, nextJobId: nextJob.id }
  }

  const result = { ...allSummary, done: true }
  await markScraperJobApplied(jobId, result)
  return result
}
