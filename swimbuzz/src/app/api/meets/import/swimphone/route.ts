import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { importMeetResults, resolveMeetDate } from "@/lib/meet-import"
import { normalizeNameMappings, normalizeRejectedNames } from "@/lib/athlete-match"
import { runBridgeJob } from "@/lib/bridge"
import { prisma } from "@/lib/prisma"
import { parseSeason } from "@/lib/season"
import { coerceParsedRelayResults } from "@/lib/relay-results"
import { BridgeJobType } from "@prisma/client"
import { LOCAL_BRIDGE_HINT } from "@/lib/scraper-or-bridge"

export const runtime = "nodejs"
export const maxDuration = 3600

type ParsedResult = {
  name: string
  event: string
  time: string
  course: string
  tags?: string
  date?: string
  place?: number
  heat?: number
  lane?: number
  heatTotal?: number
  seedTime?: string
  splits?: Array<{ distance: number; splitTime: string }>
}

type ScrapedMeet = {
  meet_name?: string
  meet_date?: string
  course?: string
  results?: ParsedResult[]
  relay_results?: unknown[]
  captcha_limited?: boolean
  incomplete_relays?: string[]
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const {
    url,
    season: seasonRaw,
    year,
    meetId: meetIdRaw,
    team: teamRaw,
    nameMappings: nameMappingsRaw,
    rejectedNames: rejectedNamesRaw,
  } = body
  const meetUrl = String(url ?? "").trim()
  const meetId = String(meetIdRaw ?? "").trim() || null
  const team = String(teamRaw ?? "").trim() || null
  const nameMappings = normalizeNameMappings(nameMappingsRaw)
  const rejectedNames = normalizeRejectedNames(rejectedNamesRaw)

  if (!meetUrl) {
    return NextResponse.json({ error: "SwimPhone meet URL is required" }, { status: 400 })
  }
  if (!team) {
    return NextResponse.json({ error: "Team code is required" }, { status: 400 })
  }
  if (!/swimphone\.com/i.test(meetUrl)) {
    return NextResponse.json({ error: "URL must be a SwimPhone meet link" }, { status: 400 })
  }

  let scraped: ScrapedMeet
  try {
    scraped = await runBridgeJob<ScrapedMeet>(session.user.id, BridgeJobType.SWIMPHONE_MEET, {
      url: meetUrl,
      team,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scrape SwimPhone meet"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json({ error: LOCAL_BRIDGE_HINT }, { status: 503 })
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }

  try {
  const meet = meetId
    ? await prisma.meet.findUnique({ where: { id: meetId } })
    : null

  const season = parseSeason(meet?.season ?? seasonRaw ?? year)
  if (!season) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }

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
    season,
    meetName,
    meetDate,
    results: scraped.results ?? [],
    relayResults: coerceParsedRelayResults(scraped.relay_results),
    source: "swimphone",
    courseDefault: scraped.course ?? "SCY",
    meetId: meet?.id ?? null,
    nameMappings,
    rejectedNames,
  })

  if (meet?.id) {
    await prisma.meet.update({
      where: { id: meet.id },
      data: { resultsUrl: meetUrl },
    })
  }

  return NextResponse.json({
    ...summary,
    meetName,
    meetDate: (meet?.startDate ?? meetDate).toISOString?.() ?? scraped.meet_date,
    captchaLimited: scraped.captcha_limited ?? false,
    incompleteRelays: scraped.incomplete_relays ?? [],
  })
  } catch (err) {
    console.error("SwimPhone import failed:", err)
    const message =
      err instanceof Error ? err.message : "Import failed while saving results"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
