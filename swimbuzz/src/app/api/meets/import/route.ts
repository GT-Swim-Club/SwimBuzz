import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { prisma } from "@/lib/prisma"
import { isStoredMeetFileUrl } from "@/lib/meet-files"
import { deleteStoredMeetFile, uploadMeetFile } from "@/lib/meet-storage"
import { FormData as UndiciFormData } from "undici"
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

export const runtime = "nodejs"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  const courseDefault = String(formData.get("course") ?? "SCY").trim().toUpperCase()
  const team = String(formData.get("team") ?? "").trim() || null
  const seasonRaw = formData.get("season") ?? formData.get("year")
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

  const scraperForm = new UndiciFormData()
  const fileBytes = await file.arrayBuffer()
  scraperForm.append(
    "file",
    new Blob([fileBytes], { type: "application/pdf" }),
    fileName
  )
  scraperForm.append("course", courseDefault)
  scraperForm.append("team", team)

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
    relay_results?: unknown[]
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
  })

  if (meet?.id) {
    try {
      if (meet.resultsUrl && isStoredMeetFileUrl(meet.resultsUrl)) {
        await deleteStoredMeetFile(meet.resultsUrl)
      }
      const { url } = await uploadMeetFile(
        Buffer.from(fileBytes),
        fileName,
        fileType
      )
      await prisma.meet.update({
        where: { id: meet.id },
        data: { resultsUrl: url },
      })
    } catch (err) {
      console.error("Failed to save results PDF as meet resource:", err)
    }
  }

  return NextResponse.json({
    ...summary,
    meetName,
    meetDate: meetDate.toISOString(),
  })
}
