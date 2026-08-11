import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete-match"
import {
  assertDocTypeMatches,
  assertMeetNameMatches,
  MeetImportValidationError,
} from "@/lib/meet-import-validate"
import { parseMeetPdf, LOCAL_SCRAPER_HINT } from "@/lib/scraper-proxy"
import { prisma } from "@/lib/prisma"
import { isStoredMeetFileUrl } from "@/lib/meet-files"
import { deleteStoredMeetFile, uploadMeetFile } from "@/lib/meet-storage"
import { notifyMeetRosterOfInfoDrops } from "@/lib/meet-roster-notify"
import { parseSeason } from "@/lib/season"
import { coerceParsedRelayResults } from "@/lib/relay-results"

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

function parseJsonField(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
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
      // Handle URL-based PDF
      try {
        const response = await fetch(pdfUrl)
        if (!response.ok) {
          return NextResponse.json({ error: "Failed to fetch PDF from URL" }, { status: 400 })
        }
        fileBytes = await response.arrayBuffer()
        // Extract filename from URL if possible
        const urlPath = new URL(pdfUrl).pathname
        const urlFileName = urlPath.split("/").pop()
        if (urlFileName && urlFileName.toLowerCase().endsWith(".pdf")) {
          fileName = urlFileName
        }
      } catch (err) {
        return NextResponse.json({ error: "Invalid PDF URL" }, { status: 400 })
      }
    } else if (isUpload(file)) {
      // Handle file upload
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
    return NextResponse.json({ error: "Cached parse data is required when pairing athletes" }, { status: 400 })
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

  let parsed: {
    course?: string
    meet_name?: string | null
    meet_date?: string | null
    detectedSheetType?: string | null
    results: ParsedResult[]
    relay_results?: unknown[]
  }
  if (cachedParse?.results) {
    parsed = {
      course: cachedParse.course,
      meet_name: cachedParse.meet_name,
      meet_date: cachedParse.meet_date,
      detectedSheetType: cachedParse.detectedSheetType,
      results: cachedParse.results,
      relay_results: cachedParse.relay_results,
    }
  } else {
    try {
      parsed = await parseMeetPdf(session.user.id, fileBytes!, {
        course: courseDefault,
        team,
        fileName,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse PDF"
      if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
        return NextResponse.json({ error: LOCAL_SCRAPER_HINT }, { status: 503 })
      }
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  try {
    assertDocTypeMatches("results", parsed.detectedSheetType)
    if (meet?.name) {
      assertMeetNameMatches(meet.name, parsed.meet_name, "PDF")
    }
  } catch (err) {
    if (err instanceof MeetImportValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const meetName =
    meet?.name ?? ((parsed.meet_name ?? "").trim() || fileName.replace(/\.pdf$/i, ""))
  const meetDate =
    meet?.startDate ?? resolveMeetDate(parsed.meet_date) ?? new Date()

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

  if (meet?.id && !pairOnly) {
    try {
      if (meet.resultsUrl && isStoredMeetFileUrl(meet.resultsUrl)) {
        await deleteStoredMeetFile(meet.resultsUrl)
      }
      let resultsUrl: string
      if (pdfUrl) {
        // If imported via URL, save the URL directly
        resultsUrl = pdfUrl
      } else {
        // If uploaded as file, store it
        const { url } = await uploadMeetFile(
          Buffer.from(fileBytes!),
          fileName,
          fileType
        )
        resultsUrl = url
      }
      await prisma.meet.update({
        where: { id: meet.id },
        data: { resultsUrl },
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

  return NextResponse.json({
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
  })
}
