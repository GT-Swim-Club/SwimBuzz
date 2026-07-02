import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { FormData as UndiciFormData } from "undici"

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

  const meetDate = resolveMeetDate(meetDateRaw)
  if (!meetDate) {
    return NextResponse.json({ error: "Invalid meet date" }, { status: 400 })
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

  const summary = await importMeetResults({
    year,
    meetName,
    meetDate,
    results: parsed.results ?? [],
    source: "meet_pdf",
    courseDefault: parsed.course || courseDefault,
  })

  return NextResponse.json(summary)
}
