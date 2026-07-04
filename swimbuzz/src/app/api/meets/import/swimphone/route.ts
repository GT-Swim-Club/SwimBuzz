import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 3600

type ParsedResult = {
  name: string
  event: string
  time: string
  course: string
  tags?: string
  date?: string
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { url, year, meetId: meetIdRaw, team: teamRaw } = await req.json()
  const meetUrl = String(url ?? "").trim()
  const seasonYear = parseInt(String(year ?? ""), 10)
  const meetId = String(meetIdRaw ?? "").trim() || null
  const team = String(teamRaw ?? "").trim() || null

  if (!meetUrl) {
    return NextResponse.json({ error: "SwimPhone meet URL is required" }, { status: 400 })
  }
  if (!Number.isFinite(seasonYear)) {
    return NextResponse.json({ error: "Season year is required" }, { status: 400 })
  }
  if (!/swimphone\.com/i.test(meetUrl)) {
    return NextResponse.json({ error: "URL must be a SwimPhone meet link" }, { status: 400 })
  }

  let scrapeRes: Response
  try {
    scrapeRes = await fetchScraper(`${SCRAPER_URL}/scrape-swimphone-meet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: meetUrl, team }),
    })
  } catch {
    return NextResponse.json(
      { error: "Could not reach scraper — is it running on port 8000?" },
      { status: 502 }
    )
  }

  const body = await scrapeRes.json().catch(() => ({}))
  if (!scrapeRes.ok) {
    const detail = body.detail
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
          : "Failed to scrape SwimPhone meet"
    return NextResponse.json({ error: message }, { status: scrapeRes.status })
  }

  const scraped = body as {
    meet_name?: string
    meet_date?: string
    course?: string
    results?: ParsedResult[]
    captcha_limited?: boolean
    incomplete_relays?: string[]
  }

  const meet = meetId
    ? await prisma.meet.findUnique({ where: { id: meetId } })
    : null

  const meetName = meet?.name ?? scraped.meet_name?.trim()
  if (!meetName) {
    return NextResponse.json(
      { error: "Could not read meet name from SwimPhone page" },
      { status: 502 }
    )
  }

  const meetDate = meet?.startDate ?? resolveMeetDate(scraped.meet_date)
  if (!meetDate) {
    return NextResponse.json(
      { error: "Could not read meet date from SwimPhone page" },
      { status: 502 }
    )
  }

  const summary = await importMeetResults({
    year: meet?.season ?? seasonYear,
    meetName,
    meetDate,
    results: scraped.results ?? [],
    source: "swimphone",
    courseDefault: scraped.course ?? "SCY",
    meetId: meet?.id ?? null,
  })

  return NextResponse.json({
    ...summary,
    meetName,
    meetDate: (meet?.startDate ?? meetDate).toISOString?.() ?? scraped.meet_date,
    captchaLimited: scraped.captcha_limited ?? false,
    incompleteRelays: scraped.incomplete_relays ?? [],
  })
}
