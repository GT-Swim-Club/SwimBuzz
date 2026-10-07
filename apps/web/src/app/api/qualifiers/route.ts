import { NextResponse } from "next/server"
import { Course } from "@prisma/client"
import { parseSeason } from "@/lib/season"
import { fetchMeetFileBytes } from "@/lib/meet/meet-file-fetch"
import { isParsablePacketUrl } from "@/lib/meet/meet-event-order"
import { parseNqtPdf } from "@/lib/meet/pdf-parser-client"
import { uploadMeetFile } from "@/lib/meet/meet-storage"
import {
  computeNationalsQualifiers,
  isNqtParseResult,
  parseNationalsCourse,
  saveNationalsStandards,
} from "@/lib/qualifiers/nationals-qualifiers"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

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

  let sourceUrlForParse: string
  try {
    const { url } = await uploadMeetFile(fileBytes, "nqt-standards.pdf", "application/pdf")
    sourceUrlForParse = url
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upload PDF"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  try {
    const parsed = await parseNqtPdf<unknown>(session.user.id, sourceUrlForParse)
    if (!isNqtParseResult(parsed) || parsed.cuts.length === 0) {
      return NextResponse.json(
        { error: "Could not find qualifying times in that PDF" },
        { status: 422 }
      )
    }

    const inferredCourse = parseNationalsCourse(parsed.course ?? null)
    const set = await saveNationalsStandards({
      season,
      course: inferredCourse ?? course,
      sourceUrl: sourceUrl || null,
      yearLabel: parsed.yearLabel ?? null,
      table: parsed.table ?? null,
      cuts: parsed.cuts,
    })

    return NextResponse.json({
      ok: true,
      set: {
        id: set.id,
        season: set.season,
        course: set.course,
        yearLabel: set.yearLabel,
        sourceUrl: set.sourceUrl,
        cutCount: set.cuts.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse NQT PDF"
    return NextResponse.json({ error: message }, { status: 502 })
  }
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
