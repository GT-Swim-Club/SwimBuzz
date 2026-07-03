import { prisma } from "@/lib/prisma"
import { buildAthleteLookup, matchAthleteIdFast } from "@/lib/athlete-match"
import { assignSwimOccurrences } from "@/lib/swim-dedup"
import {
  normalizeEventName,
  parseCourse,
  parseMeetDate,
  parseSwimTime,
} from "@/lib/swim-parse"

export type ParsedMeetResult = {
  name: string
  event: string
  time: string
  course: string
  tags?: string
}

export type MeetImportSummary = {
  imported: number
  parsed: number
  matched: number
  unmatched: ParsedMeetResult[]
  unmatchedCount: number
  skippedInvalid: number
}

export async function importMeetResults({
  year,
  meetName,
  meetDate,
  results,
  source,
  courseDefault = "SCY",
}: {
  year: number
  meetName: string
  meetDate: Date
  results: ParsedMeetResult[]
  source: string
  courseDefault?: string
}): Promise<MeetImportSummary> {
  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: year } },
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
    tags: string
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

  for (const row of results) {
    const athleteId = matchAthleteIdFast(row.name, lookup)
    const timeMs = parseSwimTime(row.time)
    const event = normalizeEventName(row.event)

    if (!athleteId || !timeMs || !event) {
      if (!athleteId) unmatched.push(row)
      else skippedInvalid++
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

    swims.push({
      athleteId,
      event,
      timeMs,
      course,
      date: meetDate,
      meet: meetName,
      tags: row.tags ?? "",
      source,
    })
  }

  const swimsToInsert = assignSwimOccurrences(swims)
  const result = await prisma.swim.createMany({
    data: swimsToInsert,
    skipDuplicates: true,
  })

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
    imported: result.count,
    parsed: results.length,
    matched: swims.length,
    unmatched: unmatched.slice(0, 25),
    unmatchedCount: unmatched.length,
    skippedInvalid,
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
