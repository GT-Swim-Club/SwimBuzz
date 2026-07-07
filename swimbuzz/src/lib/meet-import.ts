import { prisma } from "@/lib/prisma"
import { buildAthleteLookup, matchAthleteIdFast } from "@/lib/athlete-match"
import { assignSwimOccurrences } from "@/lib/swim-dedup"
import { parseCourse, parseMeetDate, parseSwimStatus, parseSwimTime, normalizeEventName } from "@/lib/swim-parse"
import {
  matchRelayResultsToRoster,
  isRelayLeadoffSwimTag,
  type ParsedRelayResult,
} from "@/lib/relay-results"
import { importRelayLeadoffSwims } from "@/lib/relay-leadoff-sync"
import {
  mergeMeetResultEntries,
  placementsToMeetResults,
  seedsToMeetResults,
  statusesToMeetResults,
  type MeetResultEntry,
} from "@/lib/meet-sheet-summary"

export type ParsedMeetResult = {
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
}

export type MeetImportSummary = {
  imported: number
  parsed: number
  matched: number
  unmatched: ParsedMeetResult[]
  unmatchedCount: number
  skippedInvalid: number
  relayResultsMatched: number
  leadoffsImported: number
  statusesMatched: number
}

export async function importMeetResults({
  season,
  meetName,
  meetDate,
  results,
  relayResults = [],
  source,
  courseDefault = "SCY",
  meetId = null,
}: {
  season: string
  meetName: string
  meetDate: Date
  results: ParsedMeetResult[]
  relayResults?: ParsedRelayResult[]
  source: string
  courseDefault?: string
  meetId?: string | null
}): Promise<MeetImportSummary> {
  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: { id: true, firstName: true, lastName: true, nicknames: true },
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
    meetId: string | null
    tags: string
    place: number | null
    source: string
  }[] = []

  const unmatched: ParsedMeetResult[] = []
  const matched: {
    sourceName: string
    athlete: string
    event: string
    time: string
    course: string
  }[] = []
  let skippedInvalid = 0
  const swimDates = new Set<string>()
  const statusRows: {
    athleteId: string
    athleteName: string
    event: string
    status: string
    tags: string
  }[] = []
  const placementRows: {
    athleteId: string
    athleteName: string
    event: string
    tags: string
    heat?: number
    lane?: number
    heatTotal?: number
  }[] = []
  const seedRows: {
    athleteId: string
    athleteName: string
    event: string
    seedTime: string
  }[] = []

  for (const row of results) {
    // Relay leadoffs are synced from leg-1 relay splits, not individual result rows.
    if (isRelayLeadoffSwimTag(row.tags ?? "")) continue

    const athleteId = matchAthleteIdFast(row.name, lookup)
    const event = normalizeEventName(row.event)
    const timeMs = parseSwimTime(row.time)
    const status = parseSwimStatus(row.time)

    if (!athleteId || !event) {
      if (!athleteId) unmatched.push(row)
      else skippedInvalid++
      continue
    }

    const seedTime = row.seedTime?.trim()
    if (seedTime && parseSwimTime(seedTime)) {
      seedRows.push({
        athleteId,
        athleteName: athleteById.get(athleteId) ?? row.name,
        event,
        seedTime,
      })
    }

    if (status) {
      statusRows.push({
        athleteId,
        athleteName: athleteById.get(athleteId) ?? row.name,
        event,
        status,
        tags: row.tags ?? "",
      })
      const heat = row.heat != null && row.heat > 0 ? row.heat : undefined
      const lane = row.lane != null ? row.lane : undefined
      if (heat != null || lane != null) {
        placementRows.push({
          athleteId,
          athleteName: athleteById.get(athleteId) ?? row.name,
          event,
          tags: row.tags ?? "",
          heat,
          lane,
          heatTotal: row.heatTotal,
        })
      }
      continue
    }

    if (!timeMs) {
      skippedInvalid++
      continue
    }

    const course = parseCourse(event, row.course || courseDefault)
    matched.push({
      sourceName: row.name,
      athlete: athleteById.get(athleteId) ?? athleteId,
      event,
      time: row.time,
      course,
    })

    // Prefer the actual day the swim happened (scraped per-event) so multi-day
    // meets date each swim correctly; fall back to the meet's start date.
    const rowDate = (row.date ? parseMeetDate(row.date) : null) ?? meetDate
    swimDates.add(rowDate.toISOString())

    swims.push({
      athleteId,
      event,
      timeMs,
      course,
      date: rowDate,
      meet: meetName,
      meetId,
      tags: row.tags ?? "",
      place: row.place ?? null,
      source,
    })

    const heat = row.heat != null && row.heat > 0 ? row.heat : undefined
    const lane = row.lane != null ? row.lane : undefined
    if (heat != null || lane != null) {
      placementRows.push({
        athleteId,
        athleteName: athleteById.get(athleteId) ?? row.name,
        event,
        tags: row.tags ?? "",
        heat,
        lane,
        heatTotal: row.heatTotal,
      })
    }
  }

  const swimsToInsert = assignSwimOccurrences(swims)
  const result = await prisma.swim.createMany({
    data: swimsToInsert,
    skipDuplicates: true,
  })

  // Re-imports skip duplicate rows — still refresh finish place when provided.
  const swimsWithPlace = swimsToInsert.filter((s) => s.place != null && s.place > 0)
  if (swimsWithPlace.length > 0 && result.count < swimsToInsert.length) {
    const PLACE_UPDATE_BATCH = 5
    for (let i = 0; i < swimsWithPlace.length; i += PLACE_UPDATE_BATCH) {
      const batch = swimsWithPlace.slice(i, i + PLACE_UPDATE_BATCH)
      await Promise.all(
        batch.map((swim) =>
          prisma.swim.updateMany({
            where: {
              athleteId: swim.athleteId,
              event: swim.event,
              timeMs: swim.timeMs,
              course: swim.course,
              date: swim.date,
              tags: swim.tags,
              occurrence: swim.occurrence,
            },
            data: { place: swim.place },
          })
        )
      )
    }
  }

  const relayEntries = matchRelayResultsToRoster(relayResults, roster)
  const courseForLeadoffs = parseCourse("", courseDefault)
  const leadoffsImported = await importRelayLeadoffSwims({
    meetName,
    meetId,
    meetDate,
    course: courseForLeadoffs,
    relayResults,
    roster,
    source,
  })
  const statusEntries = statusesToMeetResults(statusRows)
  const placementEntries = placementsToMeetResults(placementRows)
  const seedEntries = seedsToMeetResults(seedRows)
  const metaEntries = mergeMeetResultEntries(
    statusEntries,
    placementEntries,
    seedEntries
  )
  if (meetId) {
    const meetUpdate: {
      relayResultsSummary?: { entries: typeof relayEntries }
      resultStatusesSummary?: { entries: MeetResultEntry[] }
    } = {}
    if (relayEntries.length > 0) {
      meetUpdate.relayResultsSummary = { entries: relayEntries }
    }
    if (metaEntries.length > 0) {
      meetUpdate.resultStatusesSummary = { entries: metaEntries }
    }
    await prisma.meet.update({
      where: { id: meetId },
      data: meetUpdate,
    })
  }

  // Link any pre-existing (duplicate) swims from this meet so re-imports still
  // attach to the meet dashboard.
  if (meetId) {
    const dates = [...swimDates].map((iso) => new Date(iso))
    await prisma.swim.updateMany({
      where: {
        meetId: null,
        meet: meetName,
        date: { in: dates.length > 0 ? dates : [meetDate] },
      },
      data: { meetId },
    })
  }

  console.log(
    `\n--- Meet import (${source}): ${meetName} (${matched.length} matched, ${unmatched.length} unmatched) ---`
  )
  for (const m of matched) {
    console.log(
      `  MATCH  ${m.sourceName} → ${m.athlete}  |  ${m.event} (${m.course})  ${m.time}`
    )
  }
  for (const u of unmatched) {
    console.log(
      `  SKIP   ${u.name}  |  ${u.event}  ${u.time}  (no roster match)`
    )
  }
  console.log(
    `--- Imported ${result.count} new swims (${swims.length - result.count} duplicates skipped) ---\n`
  )

  return {
    imported: result.count + leadoffsImported,
    parsed: results.length,
    matched: swims.length,
    unmatched: unmatched.slice(0, 25),
    unmatchedCount: unmatched.length,
    skippedInvalid,
    relayResultsMatched: relayEntries.length,
    leadoffsImported,
    statusesMatched: statusEntries.length,
  }
}

export function resolveMeetDate(
  meetDateRaw: string | null | undefined,
  fallback?: string | null
): Date | null {
  const primary = meetDateRaw?.trim()
  if (primary) {
    const parsed = parseMeetDate(primary)
    if (parsed) return parsed
  }

  const secondary = fallback?.trim()
  if (secondary) {
    return parseMeetDate(secondary)
  }

  return null
}
