import { NextResponse } from "next/server"
import {
  athletePreferredName,
  attachmentDisposition,
  formatSeasonLabel,
  nationalsQualifiersPdfFilename,
  nationalsQualifiersTitle,
} from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { parseSeason } from "@/lib/season"
import { compareSwimEvents } from "@/lib/swim/swim-parse"
import { computeNationalsQualifiers, parseNationalsCourse } from "@/lib/qualifiers/nationals-qualifiers"
import {
  eventGroupTitle,
  parseQualifierGender,
  qualifierCountLabel,
  qualifierMarginLabel,
  selectQualifierView,
} from "@/lib/qualifiers/qualifier-events"
import { buildQualifiersPdf, type QualifiersPdfSection } from "@/lib/qualifiers/qualifiers-pdf"
import { loadNationalsEventOrder } from "@/lib/qualifiers/nationals-meet"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const cutsLabel = (count: number) => `${count} ${count === 1 ? "cut" : "cuts"}`

/**
 * Nationals qualifiers as a PDF, as the page shows them: `season` (and `course`, default SCY),
 * `gender` (M/F, else both), `group=event` (else by athlete) and the search `q`, under the season's
 * Nationals meet's full order of events (whatever the filters) with last season's Nationals
 * champion, 8th and 24th place times. Anyone signed in
 * can see the qualifiers, so anyone can export them.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const season = parseSeason(url.searchParams.get("season"))
  if (!season) return NextResponse.json({ error: "Valid season is required" }, { status: 400 })
  const course = parseNationalsCourse(url.searchParams.get("course")) ?? undefined
  const gender = parseQualifierGender(url.searchParams.get("gender"))
  const byEvent = url.searchParams.get("group") === "event"
  const query = url.searchParams.get("q")?.trim() ?? ""

  const [{ set, qualifiers }, nationalsOrder] = await Promise.all([
    computeNationalsQualifiers({ season, course, includeRelays: false }),
    loadNationalsEventOrder(season),
  ])
  const events = [...new Set(qualifiers.flatMap((athlete) => athlete.events.map((e) => e.event)))]
  const eventRank = Object.fromEntries(events.sort(compareSwimEvents).map((event, index) => [event, index]))
  const { base, athletes, eventGroups } = selectQualifierView(qualifiers, { gender, query, byEvent, eventRank })
  const showGender = gender === "all"

  const sections: QualifiersPdfSection[] = byEvent
    ? eventGroups.map((group) => ({
        title: eventGroupTitle(group, showGender),
        eventNumber: group.eventNumber,
        meta: `${group.cut} · ${qualifierCountLabel(group.swims.length)}`,
        rows: group.swims.map(({ athlete, swim }) => ({
          lead: athletePreferredName(athlete),
          time: swim.time,
          margin: qualifierMarginLabel(swim),
          meet: swim.meetName || "—",
          date: swim.date || "—",
        })),
      }))
    : athletes.map((athlete) => ({
        title: athletePreferredName(athlete),
        meta: showGender
          ? `${athlete.gender === "F" ? "Women" : "Men"} · ${cutsLabel(athlete.events.length)}`
          : cutsLabel(athlete.events.length),
        rows: athlete.events.map((swim) => ({
          lead: swim.event,
          eventNumber: swim.eventNumber,
          time: swim.time,
          margin: qualifierMarginLabel(swim),
          meet: swim.meetName || "—",
          date: swim.date || "—",
        })),
      }))

  const seasonLabel = formatSeasonLabel(season)
  const cutCount = base.reduce((sum, athlete) => sum + athlete.events.length, 0)
  const details = [
    gender === "F" ? "Women" : gender === "M" ? "Men" : null,
    qualifierCountLabel(base.length),
    cutsLabel(cutCount),
    query ? `Search “${query}”` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const emptyMessage = !set
    ? `No Nationals standards for ${seasonLabel} yet.`
    : query
      ? `No qualifiers match “${query}”.`
      : `No athletes have an individual Nationals cut in ${seasonLabel} yet.`

  const doc = buildQualifiersPdf({
    title: nationalsQualifiersTitle(season),
    details,
    sections,
    emptyMessage,
    eventOrder: nationalsOrder?.order ?? null,
    placeTimes: nationalsOrder?.placeTimes ?? null,
    placeTimesCaption: nationalsOrder?.placeTimesCaption ?? null,
  })
  const bytes = new Uint8Array(doc.output("arraybuffer"))

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(nationalsQualifiersPdfFilename(season)),
      "Cache-Control": "no-store",
    },
  })
}
