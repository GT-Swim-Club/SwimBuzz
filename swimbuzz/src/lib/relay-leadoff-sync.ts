import type { Course, Meet } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { buildAthleteLookup, matchAthleteIdFast, type RosterAthlete } from "@/lib/athlete-match"
import { normalizeSwimForInsert, nextSwimOccurrence } from "@/lib/swim-dedup"
import {
  isRealRelaySwimmerName,
  leadoffEventFromRelay,
  leadoffSwimTags,
  relayRoundFromTags,
  type ParsedRelayResult,
  type RelayRound,
  sanitizeRelaySplitTime,
} from "@/lib/relay-results"
import { parseMeetDate, parseSwimTime } from "@/lib/swim-parse"

type MeetLike = Pick<Meet, "id" | "name" | "course" | "startDate" | "endDate">

function leadoffSwimWhere(
  meet: MeetLike,
  leadoffAthleteId: string,
  leadoffEvent: string,
  relayEvent: string,
  relayRound: RelayRound = ""
) {
  return {
    athleteId: leadoffAthleteId,
    ...(meet.id ? { meetId: meet.id } : { meet: meet.name }),
    event: leadoffEvent,
    tags: leadoffSwimTags(relayEvent, relayRound),
  }
}

/** Remove the leadoff swim for this relay leg when the split is cleared. */
export async function deleteRelayLeadoffSwim(
  meet: MeetLike,
  relayEvent: string,
  leadoffAthleteId: string,
  relayRound: RelayRound = ""
) {
  const leadoffEvent = leadoffEventFromRelay(relayEvent)
  if (!leadoffEvent || !leadoffAthleteId) return null

  const existing = await prisma.swim.findFirst({
    where: leadoffSwimWhere(meet, leadoffAthleteId, leadoffEvent, relayEvent, relayRound),
    orderBy: { createdAt: "desc" },
  })
  if (!existing) return null

  return prisma.swim.delete({ where: { id: existing.id } })
}

/** Create, update, or delete the leadoff swim from leg-1 relay split time. */
export async function syncRelayLeadoffSwim(
  meet: MeetLike,
  relayEvent: string,
  leadoffAthleteId: string,
  splitTime: string | undefined,
  source = "relay",
  date?: Date,
  relayRound: RelayRound = ""
) {
  const leadoffEvent = leadoffEventFromRelay(relayEvent)
  if (!leadoffEvent || !leadoffAthleteId) return null

  const sanitized = sanitizeRelaySplitTime(splitTime)
  if (!sanitized) {
    return deleteRelayLeadoffSwim(meet, relayEvent, leadoffAthleteId, relayRound)
  }

  const timeMs = parseSwimTime(sanitized)
  if (!timeMs) return null

  const swimDate = date ?? meet.startDate ?? meet.endDate ?? new Date()

  const base = normalizeSwimForInsert({
    athleteId: leadoffAthleteId,
    event: leadoffEvent,
    timeMs,
    course: meet.course,
    date: swimDate,
    meet: meet.name,
    meetId: meet.id || null,
    tags: leadoffSwimTags(relayEvent, relayRound),
    source,
  })

  const existing = await prisma.swim.findFirst({
    where: leadoffSwimWhere(meet, leadoffAthleteId, leadoffEvent, relayEvent, relayRound),
    orderBy: { createdAt: "desc" },
  })

  if (existing) {
    return prisma.swim.update({
      where: { id: existing.id },
      data: {
        timeMs: base.timeMs,
        course: base.course,
        date: base.date,
        meet: base.meet,
        meetId: base.meetId,
        tags: base.tags,
      },
    })
  }

  const occurrence = await nextSwimOccurrence(prisma, base)
  return prisma.swim.create({
    data: { ...base, occurrence },
  })
}

/** Import leadoff swims from leg-1 relay split times (not separate leadoff rows). */
export async function importRelayLeadoffSwims({
  meetName,
  meetId,
  meetDate,
  course,
  relayResults,
  roster,
  source,
  nameMappings = null,
}: {
  meetName: string
  meetId: string | null
  meetDate: Date
  course: Course
  relayResults: ParsedRelayResult[]
  roster: RosterAthlete[]
  source: string
  nameMappings?: Record<string, string> | null
}): Promise<number> {
  const lookup = buildAthleteLookup(roster)
  const meet: MeetLike = meetId
    ? ((await prisma.meet.findUnique({ where: { id: meetId } })) ?? {
        id: meetId,
        name: meetName,
        course,
        startDate: meetDate,
        endDate: meetDate,
      })
    : {
        id: "",
        name: meetName,
        course,
        startDate: meetDate,
        endDate: meetDate,
      }

  const seen = new Set<string>()
  let imported = 0

  for (const row of relayResults) {
    const leg1 = row.relaySwimmers.find((s) => s.leg === 1)
    if (!leg1) continue
    const splitTime = sanitizeRelaySplitTime(leg1.splitTime)
    if (!splitTime || !isRealRelaySwimmerName(leg1.name)) continue

    const athleteId = matchAthleteIdFast(leg1.name, lookup, nameMappings)
    if (!athleteId) continue

    const leadoffEvent = leadoffEventFromRelay(row.event)
    if (!leadoffEvent) continue

    const relayRound = relayRoundFromTags(row.tags ?? "")
    const swimDate = row.date ? (parseMeetDate(row.date) ?? meetDate) : meetDate
    const key = `${athleteId}|${leadoffEvent}|${row.event}|${relayRound}|${splitTime}|${swimDate.toISOString()}`
    if (seen.has(key)) continue
    seen.add(key)

    const created = await syncRelayLeadoffSwim(
      meet,
      row.event,
      athleteId,
      splitTime,
      source,
      swimDate,
      relayRound
    )
    if (created) imported++
  }

  return imported
}
