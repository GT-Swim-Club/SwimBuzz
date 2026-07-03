import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { prisma } from "@/lib/prisma"
import { FormData as UndiciFormData } from "undici"

function isUpload(value: unknown): value is Blob {
  return value != null && typeof value !== "string" && typeof (value as Blob).arrayBuffer === "function"
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
  const courseDefault = String(formData.get("course") ?? "SCY").trim().toUpperCase()
  const year = parseInt(String(formData.get("year") ?? ""), 10)
  const meetId = String(formData.get("meetId") ?? "").trim() || null

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
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: "Season year is required" }, { status: 400 })
  }

  // Use undici's FormData/File so the multipart body is serialized correctly by
  // undici's fetch (fetchScraper). Mixing Node's global FormData with the
  // standalone undici fetch drops the file part → scraper 422 "field required".
  const scraperForm = new UndiciFormData()
  const fileBytes = await file.arrayBuffer()
  scraperForm.append(
    "file",
    new Blob([fileBytes], { type: "application/pdf" }),
    fileName
  )
  scraperForm.append("course", courseDefault)

  let parseRes: Response
  try {
    parseRes = await fetchScraper(`${SCRAPER_URL}/parse-meet-pdf`, {
      method: "POST",
      body: scraperForm as unknown as BodyInit,
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
    meet_name?: string | null
    meet_date?: string | null
    results: ParsedResult[]
  }

  // When importing into an existing meet dashboard, anchor to that meet's own
  // name/date/season so results link to it consistently.
  const meet = meetId
    ? await prisma.meet.findUnique({ where: { id: meetId } })
    : null

  const meetName =
    meet?.name ?? ((parsed.meet_name ?? "").trim() || fileName.replace(/\.pdf$/i, ""))
  const meetDate =
    meet?.startDate ?? resolveMeetDate(parsed.meet_date) ?? new Date()
  const seasonYear = meet?.season ?? year

  const summary = await importMeetResults({
    year: seasonYear,
    meetName,
    meetDate,
    results: parsed.results ?? [],
    source: "meet_pdf",
    courseDefault: parsed.course || courseDefault,
    meetId: meet?.id ?? null,
  })

  return NextResponse.json({
    ...summary,
    meetName,
    meetDate: meetDate.toISOString(),
  })
}
