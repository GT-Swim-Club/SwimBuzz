import { NextResponse } from "next/server"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete-match"
import {
  assertDocTypeMatches,
  assertMeetNameMatches,
  MeetImportValidationError,
} from "@/lib/meet-import-validate"
import {
  enqueueParseMeetPdf,
  LOCAL_SCRAPER_HINT,
} from "@/lib/scraper-proxy"
import {
  getScraperJobForUser,
  markScraperJobApplied,
} from "@/lib/scraper"
import { ScraperJobStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { isStoredMeetFileUrl } from "@/lib/meet-files"
import { deleteStoredMeetFile, uploadMeetFile } from "@/lib/meet-storage"
import { notifyMeetRosterOfInfoDrops } from "@/lib/meet-roster-notify"
import { parseSeason } from "@/lib/season"
import { coerceParsedRelayResults } from "@/lib/relay-results"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

function isUpload(value: unknown): value is Blob {
  return value != null && typeof value !== "string" && typeof (value as Blob).arrayBuffer === "function"
}

type ParsedResult = {
  name: string
  event: string
  time: string
  course: string
  tags?: string
  place?: number
}

type MeetPdfApplyContext = {
  kind: "meet_pdf_import"
  season: string
  courseDefault: string
  team: string
  meetId: string | null
  expectedMeetName: string | null
  nameMappings: ReturnType<typeof normalizeNameMappings>
  rejectedNames: ReturnType<typeof normalizeRejectedNames>
  pairOnly: boolean
  resultsPdfUrl: string | null
  fileName: string
}

function parseJsonField(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const runtime = "nodejs"
export const maxDuration = 300

async function applyParsedMeetPdf(input: {
  parsed: {
    course?: string
    meet_name?: string | null
    meet_date?: string | null
    detectedSheetType?: string | null
    results: ParsedResult[]
    relay_results?: unknown[]
  }
  season: string
  courseDefault: string
  meet: { id: string; name: string; startDate: Date; resultsUrl: string | null } | null
  nameMappings: ReturnType<typeof normalizeNameMappings>
  rejectedNames: ReturnType<typeof normalizeRejectedNames>
  pairOnly: boolean
  resultsPdfUrl: string | null
  fileName: string
}) {
  const { parsed, season, courseDefault, meet, nameMappings, rejectedNames, pairOnly, resultsPdfUrl, fileName } =
    input

  assertDocTypeMatches("results", parsed.detectedSheetType)
  if (meet?.name) {
    assertMeetNameMatches(meet.name, parsed.meet_name, "PDF")
  }

  const meetName =
    meet?.name ?? ((parsed.meet_name ?? "").trim() || fileName.replace(/\.pdf$/i, ""))
  const meetDate = meet?.startDate ?? resolveMeetDate(parsed.meet_date) ?? new Date()

  const summary = await importMeetResults({
    season,
    meetName,
    meetDate,
    results: parsed.results ?? [],
    relayResults: coerceParsedRelayResults(parsed.relay_results),
    source: "meet_pdf",
    courseDefault: parsed.course || courseDefault,
    meetId: meet?.id ?? null,
    nameMappings,
    rejectedNames,
    pairOnly,
    allResults: parsed.results ?? [],
    allRelayResults: coerceParsedRelayResults(parsed.relay_results),
  })

  if (meet?.id && !pairOnly && resultsPdfUrl) {
    try {
      if (meet.resultsUrl && isStoredMeetFileUrl(meet.resultsUrl)) {
        await deleteStoredMeetFile(meet.resultsUrl)
      }
      await prisma.meet.update({
        where: { id: meet.id },
        data: { resultsUrl: resultsPdfUrl },
      })
      if (summary.imported > 0) {
        void notifyMeetRosterOfInfoDrops({
          meetId: meet.id,
          meetName: meet.name,
          drops: ["results"],
        })
      }
    } catch (err) {
      console.error("Failed to save results PDF as meet resource:", err)
    }
  }

  return {
    ...summary,
    meetName,
    meetDate: meetDate.toISOString(),
    cachedParse:
      summary.nameConfirmations.length > 0
        ? {
            course: parsed.course,
            meet_name: parsed.meet_name,
            meet_date: parsed.meet_date,
            detectedSheetType: parsed.detectedSheetType,
            results: parsed.results ?? [],
            relay_results: parsed.relay_results ?? [],
          }
        : undefined,
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  const pdfUrl = String(formData.get("pdfUrl") ?? "").trim() || null
  const courseDefault = String(formData.get("course") ?? "SCY").trim().toUpperCase()
  const team = String(formData.get("team") ?? "").trim() || null
  const seasonRaw = formData.get("season") ?? formData.get("year")
  const meetId = String(formData.get("meetId") ?? "").trim() || null
  const nameMappings = normalizeNameMappings(parseJsonField(formData.get("nameMappings")))
  const rejectedNames = normalizeRejectedNames(parseJsonField(formData.get("rejectedNames")))
  const cachedParse = parseJsonField(formData.get("cachedParse")) as {
    course?: string
    meet_name?: string | null
    meet_date?: string | null
    detectedSheetType?: string | null
    results?: ParsedResult[]
    relay_results?: unknown[]
  } | null

  const pairOnly = Boolean(nameMappings)

  if (!pairOnly && !isUpload(file) && !pdfUrl) {
    return NextResponse.json({ error: "PDF file or URL is required" }, { status: 400 })
  }

  let fileName = "meet-results.pdf"
  let fileType = "application/pdf"
  let fileBytes: ArrayBuffer | undefined

  if (!pairOnly) {
    if (pdfUrl) {
      try {
        const response = await fetch(pdfUrl)
        if (!response.ok) {
          return NextResponse.json({ error: "Failed to fetch PDF from URL" }, { status: 400 })
        }
        fileBytes = await response.arrayBuffer()
        const urlPath = new URL(pdfUrl).pathname
        const urlFileName = urlPath.split("/").pop()
        if (urlFileName && urlFileName.toLowerCase().endsWith(".pdf")) {
          fileName = urlFileName
        }
      } catch {
        return NextResponse.json({ error: "Invalid PDF URL" }, { status: 400 })
      }
    } else if (isUpload(file)) {
      fileName = file instanceof File && file.name ? file.name : "meet-results.pdf"
      fileType = (file instanceof File && file.type) || "application/pdf"
      if (!fileName.toLowerCase().endsWith(".pdf") && fileType !== "application/pdf") {
        return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })
      }
      fileBytes = await file.arrayBuffer()
    } else {
      return NextResponse.json({ error: "PDF file or URL is required" }, { status: 400 })
    }
  }

  if (pairOnly && !cachedParse?.results) {
    return NextResponse.json(
      { error: "Cached parse data is required when pairing athletes" },
      { status: 400 }
    )
  }
  const meet = meetId
    ? await prisma.meet.findUnique({ where: { id: meetId } })
    : null

  const season = parseSeason(meet?.season ?? seasonRaw)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

  if (!team) {
    return NextResponse.json({ error: "Team code is required" }, { status: 400 })
  }

  // Pairing / cached parse stays synchronous (no scraper).
  if (cachedParse?.results) {
    try {
      const summary = await applyParsedMeetPdf({
        parsed: {
          course: cachedParse.course,
          meet_name: cachedParse.meet_name,
          meet_date: cachedParse.meet_date,
          detectedSheetType: cachedParse.detectedSheetType,
          results: cachedParse.results,
          relay_results: cachedParse.relay_results,
        },
        season,
        courseDefault,
        meet,
        nameMappings,
        rejectedNames,
        pairOnly,
        resultsPdfUrl: pdfUrl,
        fileName,
      })
      return NextResponse.json(summary)
    } catch (err) {
      if (err instanceof MeetImportValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      throw err
    }
  }

  let resultsPdfUrl = pdfUrl
  if (!resultsPdfUrl && fileBytes) {
    try {
      const { url } = await uploadMeetFile(Buffer.from(fileBytes), fileName, fileType)
      resultsPdfUrl = url
    } catch (err) {
      console.error("Failed to upload meet PDF before scrape:", err)
    }
  }

  const applyContext: MeetPdfApplyContext = {
    kind: "meet_pdf_import",
    season,
    courseDefault,
    team,
    meetId: meet?.id ?? null,
    expectedMeetName: meet?.name ?? null,
    nameMappings,
    rejectedNames,
    pairOnly: false,
    resultsPdfUrl,
    fileName,
  }

  try {
    const job = await enqueueParseMeetPdf(
      session.user.id,
      fileBytes!,
      { course: courseDefault, team, fileName },
      applyContext
    )
    return NextResponse.json({ jobId: job.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse PDF"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json({ error: LOCAL_SCRAPER_HINT }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function applyMeetPdfImportJob(jobId: string, userId: string) {
  const job = await getScraperJobForUser(jobId, userId)
  if (!job) throw new Error("Job not found")
  if (job.status !== ScraperJobStatus.COMPLETED) {
    throw new Error(job.error ?? "Job is not complete")
  }
  if (job.appliedAt && job.applyResult) {
    return job.applyResult as Record<string, unknown>
  }

  const ctx = job.applyContext as MeetPdfApplyContext | null
  if (!ctx || ctx.kind !== "meet_pdf_import") {
    throw new Error("Invalid job context")
  }

  const parsed = job.result as {
    course?: string
    meet_name?: string | null
    meet_date?: string | null
    detectedSheetType?: string | null
    results: ParsedResult[]
    relay_results?: unknown[]
  }

  const meet = ctx.meetId
    ? await prisma.meet.findUnique({ where: { id: ctx.meetId } })
    : null

  const summary = await applyParsedMeetPdf({
    parsed,
    season: ctx.season,
    courseDefault: ctx.courseDefault,
    meet,
    nameMappings: ctx.nameMappings,
    rejectedNames: ctx.rejectedNames,
    pairOnly: ctx.pairOnly,
    resultsPdfUrl: ctx.resultsPdfUrl,
    fileName: ctx.fileName,
  })

  await markScraperJobApplied(
    jobId,
    JSON.parse(JSON.stringify(summary)) as Prisma.InputJsonValue
  )
  return summary
}
