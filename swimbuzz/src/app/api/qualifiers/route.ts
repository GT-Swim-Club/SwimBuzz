import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Course } from "@prisma/client"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { parseSeason } from "@/lib/season"
import { fetchMeetFileBytes } from "@/lib/meet-file-fetch"
import { isParsablePacketUrl } from "@/lib/meet-event-order"
import { parseNqtPdf, LOCAL_BRIDGE_HINT } from "@/lib/scraper-or-bridge"
import {
  isNqtParseResult,
  parseNationalsCourse,
  saveNationalsStandards,
} from "@/lib/nationals-qualifiers"
import { prisma } from "@/lib/prisma"

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
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const season = parseSeason(url.searchParams.get("season"))
  if (!season) {
    return NextResponse.json({ error: "Valid season is required" }, { status: 400 })
  }

  const course = parseNationalsCourse(url.searchParams.get("course")) ?? undefined
  const set = await prisma.nationalsStandardSet.findFirst({
    where: { season, ...(course ? { course } : {}) },
    include: {
      cuts: {
        where: { isRelay: false },
        orderBy: [{ event: "asc" }, { gender: "asc" }],
      },
    },
    orderBy: { course: "asc" },
  })

  return NextResponse.json({ set })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
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

  let parsed: unknown
  try {
    parsed = await parseNqtPdf(session.user.id, fileBytes)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse NQT PDF"
    const status = message.includes(LOCAL_BRIDGE_HINT) || /not connected/i.test(message) ? 503 : 502
    return NextResponse.json({ error: message }, { status })
  }

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
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const season = parseSeason(url.searchParams.get("season"))
  const course = parseNationalsCourse(url.searchParams.get("course")) ?? Course.SCY
  if (!season) {
    return NextResponse.json({ error: "Valid season is required" }, { status: 400 })
  }

  const existing = await prisma.nationalsStandardSet.findUnique({
    where: { season_course: { season, course } },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: "No standards found for that season" }, { status: 404 })
  }

  await prisma.nationalsStandardSet.delete({ where: { id: existing.id } })
  return NextResponse.json({ ok: true })
}
