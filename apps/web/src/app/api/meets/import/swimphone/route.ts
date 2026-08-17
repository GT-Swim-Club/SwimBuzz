import { NextResponse } from "next/server"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete-match"
import {
  assertMeetNameMatches,
  MeetImportValidationError,
} from "@/lib/meet-import-validate"
import {
  enqueueScraperJob,
  getScraperJobForUser,
  markScraperJobApplied,
  LOCAL_SCRAPER_HINT,
} from "@/lib/scraper"
import { prisma } from "@/lib/prisma"
import { parseSeason } from "@/lib/season"
import { coerceParsedRelayResults } from "@/lib/relay-results"
import { ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { notifyMeetRosterOfInfoDrops } from "@/lib/meet-roster-notify"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const maxDuration = 300

type ParsedResult = {
  name: string
  event: string
  time: string
  course: string
  tags?: string
  date?: string
  place?: number
  heat?: number
  lane?: number
  heatTotal?: number
  seedTime?: string
  splits?: Array<{ distance: number; splitTime: string }>
}

type ScrapedMeet = {
  meet_name?: string
  meet_date?: string
  course?: string
  results?: ParsedResult[]
  relay_results?: unknown[]
  captcha_limited?: boolean
  incomplete_relays?: string[]
}

type SwimphoneApplyContext = {
  kind: "swimphone_import"
  meetUrl: string
  season: string
  meetId: string | null
  team: string
  nameMappings: ReturnType<typeof normalizeNameMappings>
  rejectedNames: ReturnType<typeof normalizeRejectedNames>
  expectedMeetName: string | null
}

function scraperErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Failed to scrape SwimPhone meet"
  if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
    return NextResponse.json({ error: LOCAL_SCRAPER_HINT }, { status: 503 })
  }
  return NextResponse.json({ error: message }, { status: 502 })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const {
    url,
    season: seasonRaw,
    year,
    meetId: meetIdRaw,
    team: teamRaw,
    nameMappings: nameMappingsRaw,
    rejectedNames: rejectedNamesRaw,
  } = body
  const meetUrl = String(url ?? "").trim()
  const meetId = String(meetIdRaw ?? "").trim() || null
  const team = String(teamRaw ?? "").trim() || null
  const nameMappings = normalizeNameMappings(nameMappingsRaw)
  const rejectedNames = normalizeRejectedNames(rejectedNamesRaw)

  if (!meetUrl) {
    return NextResponse.json({ error: "SwimPhone meet URL is required" }, { status: 400 })
  }
  if (!team) {
    return NextResponse.json({ error: "Team code is required" }, { status: 400 })
  }
  if (!/swimphone\.com/i.test(meetUrl)) {
    return NextResponse.json({ error: "URL must be a SwimPhone meet link" }, { status: 400 })
  }

  const meet = meetId
    ? await prisma.meet.findUnique({ where: { id: meetId } })
    : null

  const season = parseSeason(meet?.season ?? seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  const applyContext: SwimphoneApplyContext = {
    kind: "swimphone_import",
    meetUrl,
    season,
    meetId: meet?.id ?? null,
    team,
    nameMappings,
    rejectedNames,
    expectedMeetName: meet?.name ?? null,
  }

  try {
    const job = await enqueueScraperJob(
      session.user.id,
      ScraperJobType.SWIMPHONE_MEET,
      { url: meetUrl, team },
      applyContext
    )
    return NextResponse.json({ jobId: job.id })
  } catch (err) {
    return scraperErrorResponse(err)
  }
}

export async function applySwimphoneImportJob(jobId: string, userId: string) {
  const job = await getScraperJobForUser(jobId, userId)
  if (!job) throw new Error("Job not found")
  if (job.status !== ScraperJobStatus.COMPLETED) {
    throw new Error(job.error ?? "Job is not complete")
  }
  if (job.appliedAt && job.applyResult) {
    return job.applyResult as Record<string, unknown>
  }

  const ctx = job.applyContext as SwimphoneApplyContext | null
  if (!ctx || ctx.kind !== "swimphone_import") {
    throw new Error("Invalid job context")
  }

  const scraped = job.result as ScrapedMeet
  const meet = ctx.meetId
    ? await prisma.meet.findUnique({ where: { id: ctx.meetId } })
    : null

  if (ctx.expectedMeetName) {
    try {
      assertMeetNameMatches(ctx.expectedMeetName, scraped.meet_name, "SwimPhone page")
    } catch (err) {
      if (err instanceof MeetImportValidationError) {
        throw err
      }
      throw err
    }
  }

  const meetName = meet?.name ?? scraped.meet_name?.trim()
  if (!meetName) {
    throw new Error("Could not read meet name from SwimPhone page")
  }

  const meetDate = meet?.startDate ?? resolveMeetDate(scraped.meet_date)
  if (!meetDate) {
    throw new Error("Could not read meet date from SwimPhone page")
  }

  const summary = await importMeetResults({
    season: ctx.season,
    meetName,
    meetDate,
    results: scraped.results ?? [],
    relayResults: coerceParsedRelayResults(scraped.relay_results),
    source: "swimphone",
    courseDefault: scraped.course ?? "SCY",
    meetId: meet?.id ?? null,
    nameMappings: ctx.nameMappings,
    rejectedNames: ctx.rejectedNames,
  })

  if (meet?.id) {
    await prisma.meet.update({
      where: { id: meet.id },
      data: { swimphoneUrl: ctx.meetUrl },
    })
    if (summary.imported > 0) {
      void notifyMeetRosterOfInfoDrops({
        meetId: meet.id,
        meetName: meet.name,
        drops: ["results"],
      })
    }
  }

  const result = {
    ...summary,
    meetName,
    meetDate: (meet?.startDate ?? meetDate).toISOString?.() ?? scraped.meet_date,
    captchaLimited: scraped.captcha_limited ?? false,
    incompleteRelays: scraped.incomplete_relays ?? [],
  }
  await markScraperJobApplied(jobId, result)
  return result
}
