import { NextResponse } from "next/server"
import { Course, ScraperJobStatus } from "@prisma/client"
import { parseSeason } from "@/lib/season"
import { fetchMeetFileBytes } from "@/lib/meet-file-fetch"
import { isParsablePacketUrl } from "@/lib/meet-event-order"
import { enqueueParseNqtPdf, LOCAL_SCRAPER_HINT } from "@/lib/scraper-proxy"
import {
  getScraperJobForUser,
  markScraperJobApplied,
} from "@/lib/scraper"
import {
  computeNationalsQualifiers,
  isNqtParseResult,
  parseNationalsCourse,
  saveNationalsStandards,
} from "@/lib/nationals-qualifiers"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_BYTES = 20 * 1024 * 1024

function isUpload(value: unknown): value is File {
  return (
    value != null &&
    typeof value !== "string" &&
    typeof (value as File).arrayBuffer === "function"
  )
}

type NqtApplyContext = {
  kind: "nqt_upload"
  season: string
  course: Course
  sourceUrl: string | null
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const season = parseSeason(url.searchParams.get("season"))
  if (!season) {
    return NextResponse.json({ error: "Valid season is required" }, { status: 400 })
  }

  const course = parseNationalsCourse(url.searchParams.get("course")) ?? undefined
  const genderRaw = url.searchParams.get("gender")
  const gender =
    genderRaw === "M" || genderRaw === "F" ? (genderRaw as "M" | "F") : null

  const { set, qualifiers, qualifierCount, standards } =
    await computeNationalsQualifiers({
      season,
      course,
      gender,
      includeRelays: false,
    })

  const cuts = standards.flatMap((row) => {
    const out: Array<{
      event: string
      gender: "M" | "F"
      note: string | null
      timeMs?: number
    }> = []
    if (row.women && row.women !== "--") {
      out.push({ event: row.event, gender: "F", note: row.women })
    }
    if (row.men && row.men !== "--") {
      out.push({ event: row.event, gender: "M", note: row.men })
    }
    return out
  })

  return NextResponse.json({
    set: set
      ? {
          id: set.id,
          season: set.season,
          course: set.course,
          label: set.label,
          sourceUrl: set.sourceUrl,
          yearLabel: set.yearLabel,
          updatedAt:
            set.updatedAt instanceof Date
              ? set.updatedAt.toISOString()
              : set.updatedAt,
          cutCount: set.cutCount,
          cuts,
        }
      : null,
    qualifiers,
    qualifierCount,
    standards,
  })
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const contentType = req.headers.get("content-type") ?? ""
  let seasonRaw = ""
  let courseRaw = "SCY"
  let sourceUrl = ""
  let fileBytes: Buffer | null = null

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      seasonRaw = String(form.get("season") ?? "")
      courseRaw = String(form.get("course") ?? "SCY")
      sourceUrl = String(form.get("url") ?? "").trim()
      const file = form.get("file")
      if (isUpload(file)) {
        fileBytes = Buffer.from(await file.arrayBuffer())
      }
    } else {
      const body = await req.json().catch(() => ({}))
      seasonRaw = String(body.season ?? "")
      courseRaw = String(body.course ?? "SCY")
      sourceUrl = String(body.url ?? "").trim()
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const season = parseSeason(seasonRaw)
  if (!season) {
    return NextResponse.json({ error: "Valid season is required" }, { status: 400 })
  }

  const course = parseNationalsCourse(courseRaw) ?? Course.SCY

  if (!fileBytes && sourceUrl) {
    if (!isParsablePacketUrl(sourceUrl)) {
      return NextResponse.json({ error: "Unsupported file URL" }, { status: 400 })
    }
    try {
      fileBytes = await fetchMeetFileBytes(sourceUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not download PDF"
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  if (!fileBytes) {
    return NextResponse.json(
      { error: "Upload a PDF or provide a PDF URL" },
      { status: 400 }
    )
  }

  if (fileBytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 20 MB or smaller" }, { status: 400 })
  }

  if (fileBytes.length < 4 || fileBytes.subarray(0, 4).toString("utf8") !== "%PDF") {
    return NextResponse.json({ error: "File is not a PDF" }, { status: 400 })
  }

  try {
    const job = await enqueueParseNqtPdf(session.user.id, fileBytes, {
      kind: "nqt_upload",
      season,
      course,
      sourceUrl: sourceUrl || null,
    } satisfies NqtApplyContext)
    return NextResponse.json({ jobId: job.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse NQT PDF"
    const status =
      message.includes(LOCAL_SCRAPER_HINT) || /not connected/i.test(message) ? 503 : 502
    return NextResponse.json({ error: message }, { status })
  }
}

export async function applyNqtUploadJob(jobId: string, userId: string) {
  const job = await getScraperJobForUser(jobId, userId)
  if (!job) throw new Error("Job not found")
  if (job.status !== ScraperJobStatus.COMPLETED) {
    throw new Error(job.error ?? "Job is not complete")
  }
  if (job.appliedAt && job.applyResult) {
    return job.applyResult as Record<string, unknown>
  }

  const ctx = job.applyContext as NqtApplyContext | null
  if (!ctx || ctx.kind !== "nqt_upload") {
    throw new Error("Invalid job context")
  }

  const parsed = job.result
  if (!isNqtParseResult(parsed) || parsed.cuts.length === 0) {
    throw new Error("Could not find qualifying times in that PDF")
  }

  const inferredCourse = parseNationalsCourse(parsed.course ?? null)
  const set = await saveNationalsStandards({
    season: ctx.season,
    course: inferredCourse ?? ctx.course,
    sourceUrl: ctx.sourceUrl,
    yearLabel: parsed.yearLabel ?? null,
    table: parsed.table ?? null,
    cuts: parsed.cuts,
  })

  const summary = {
    ok: true,
    set: {
      id: set.id,
      season: set.season,
      course: set.course,
      yearLabel: set.yearLabel,
      sourceUrl: set.sourceUrl,
      cutCount: set.cuts.length,
    },
  }
  await markScraperJobApplied(jobId, summary)
  return summary
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const season = parseSeason(url.searchParams.get("season"))
  const course = parseNationalsCourse(url.searchParams.get("course")) ?? Course.SCY
  if (!season) {
    return NextResponse.json({ error: "Valid season is required" }, { status: 400 })
  }

  await prisma.nationalsStandardSet.deleteMany({
    where: { season, course },
  })
  return NextResponse.json({ ok: true })
}
