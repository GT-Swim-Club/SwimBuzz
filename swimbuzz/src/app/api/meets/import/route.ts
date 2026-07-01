import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { buildAthleteLookup, matchAthleteIdFast } from "@/lib/athlete-match"
import {
  normalizeEventName,
  parseCourse,
  parseMeetDate,
  parseSwimTime,
} from "@/lib/swim-parse"

const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://localhost:8000"

function isUpload(value: FormDataEntryValue | null): value is File | Blob {
  return value != null && typeof value !== "string" && "arrayBuffer" in value
}

type ParsedResult = {
  name: string
  event: string
  time: string
  course: string
}

export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  const meetName = String(formData.get("meetName") ?? "").trim()
  const meetDateRaw = String(formData.get("meetDate") ?? "").trim()
  const courseDefault = String(formData.get("course") ?? "SCY").trim().toUpperCase()
  const gender = String(formData.get("gender") ?? "M").trim() === "F" ? "F" : "M"
  const year = parseInt(String(formData.get("year") ?? ""), 10)

  if (!isUpload(file)) {
    return NextResponse.json({ error: "PDF file is required" }, { status: 400 })
  }

  const fileName =
    file instanceof File && file.name ? file.name : "meet-results.pdf"
  const fileType =
    (file instanceof File && file.type) || "application/pdf"

  if (!fileName.toLowerCase().endsWith(".pdf") && fileType !== "application/pdf") {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })
  }
  if (!meetName) {
    return NextResponse.json({ error: "Meet name is required" }, { status: 400 })
  }
  if (!meetDateRaw) {
    return NextResponse.json({ error: "Meet date is required" }, { status: 400 })
  }
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "Season year is required" }, { status: 400 })
  }

  const meetDate = parseMeetDate(meetDateRaw)
  if (!meetDate) {
    return NextResponse.json({ error: "Invalid meet date" }, { status: 400 })
  }

  const scraperForm = new FormData()
  const fileBytes = await file.arrayBuffer()
  scraperForm.append(
    "file",
    new Blob([fileBytes], { type: "application/pdf" }),
    fileName
  )
  scraperForm.append("course", courseDefault)

  let parseRes: Response
  try {
    parseRes = await fetch(`${SCRAPER_URL}/parse-meet-pdf`, {
      method: "POST",
      body: scraperForm,
    })
  } catch {
    return NextResponse.json(
      { error: "Could not reach PDF parser — is the scraper running on port 8000?" },
      { status: 502 }
    )
  }

  if (!parseRes.ok) {
    const err = await parseRes.json().catch(() => ({}))
    const detail = err.detail
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
          : "Failed to parse PDF"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const parsed = (await parseRes.json()) as {
    course?: string
    results: ParsedResult[]
  }

  const roster = await prisma.athlete.findMany({
    where: { gender, seasons: { has: year } },
    select: { id: true, firstName: true, lastName: true },
  })

  const lookup = buildAthleteLookup(roster)
  const athleteById = new Map(
    roster.map((a) => [a.id, `${a.firstName} ${a.lastName}`])
  )

  const swims: {
    athleteId: string
    event: string
    timeMs: number
    course: ReturnType<typeof parseCourse>
    date: Date
    meet: string
    source: string
  }[] = []

  const unmatched: ParsedResult[] = []
  let skippedInvalid = 0

  const matched: { pdfName: string; athlete: string; event: string; time: string }[] = []

  for (const row of parsed.results ?? []) {
    const athleteId = matchAthleteIdFast(row.name, lookup)
    const timeMs = parseSwimTime(row.time)
    const event = normalizeEventName(row.event)

    if (!athleteId || !timeMs || !event) {
      if (!athleteId) unmatched.push(row)
      else skippedInvalid++
      continue
    }

    matched.push({
      pdfName: row.name,
      athlete: athleteById.get(athleteId) ?? athleteId,
      event,
      time: row.time,
    })

    swims.push({
      athleteId,
      event,
      timeMs,
      course: parseCourse(event, row.course || parsed.course || courseDefault),
      date: meetDate,
      meet: meetName,
      source: "meet_pdf",
    })
  }

  const result = await prisma.swim.createMany({
    data: swims,
    skipDuplicates: true,
  })

  console.log(`\n--- Meet PDF import: ${meetName} (${matched.length} matched, ${unmatched.length} unmatched) ---`)
  for (const m of matched) {
    console.log(`  MATCH  ${m.pdfName} → ${m.athlete}  |  ${m.event}  ${m.time}`)
  }
  for (const u of unmatched) {
    console.log(`  SKIP   ${u.name}  |  ${u.event}  ${u.time}  (no roster match)`)
  }
  console.log(`--- Imported ${result.count} new swims (${swims.length - result.count} duplicates skipped) ---\n`)

  return NextResponse.json({
    imported: result.count,
    parsed: parsed.results?.length ?? 0,
    matched: swims.length,
    unmatched: unmatched.slice(0, 25),
    unmatchedCount: unmatched.length,
    skippedInvalid,
  })
}
