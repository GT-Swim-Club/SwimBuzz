import type { Course, Meet } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { buildAthleteLookup, matchAthleteIdFast, type RosterAthlete } from "@/lib/athlete/athlete-match"
import { normalizeSwimForInsert, nextSwimOccurrence } from "@/lib/swim/swim-dedup"
import {
  isRealRelaySwimmerName,
  leadoffEventFromRelay,
  effectiveRelayGender,
  leadoffSwimTags,
  parseRelayGender,
  relayGenderFromEventName,
  relayRoundFromTags,
  type ParsedRelayResult,
  type RelayGender,
  type RelayRound,
  sanitizeRelaySplitTime,
} from "@/lib/meet/relay-results"
import { parseMeetDate, parseSwimStatus, parseSwimTime } from "@/lib/swim/swim-parse"

type MeetLike = Pick<Meet, "id" | "name" | "course" | "startsAt" | "endsAt" | "createdAt">

function leadoffSwimWhere(
  meet: MeetLike,
  leadoffAthleteId: string,
  leadoffEvent: string,
  relayEvent: string,
  relayRound: RelayRound = "",
  relayGender: RelayGender = ""
) {
  return {
    athleteId: leadoffAthleteId,
    ...(meet.id ? { meetId: meet.id } : { meet: meet.name }),
    event: leadoffEvent,
    tags: leadoffSwimTags(relayEvent, relayRound, relayGender),
  }
}

/** Remove the leadoff swim for this relay leg when the split is cleared. */
export async function deleteRelayLeadoffSwim(
  meet: MeetLike,
  relayEvent: string,
  leadoffAthleteId: string,
  relayRound: RelayRound = "",
  relayGender: RelayGender = ""
) {
  const leadoffEvent = leadoffEventFromRelay(relayEvent)
  if (!leadoffEvent || !leadoffAthleteId) return null

  const existing = await prisma.swim.findFirst({
    where: leadoffSwimWhere(meet, leadoffAthleteId, leadoffEvent, relayEvent, relayRound, relayGender),
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
  relayRound: RelayRound = "",
  relayGender: RelayGender = ""
) {
  const leadoffEvent = leadoffEventFromRelay(relayEvent)
  if (!leadoffEvent || !leadoffAthleteId) return null

  const sanitized = sanitizeRelaySplitTime(splitTime)
  if (!sanitized) {
    return deleteRelayLeadoffSwim(meet, relayEvent, leadoffAthleteId, relayRound, relayGender)
  }

  const timeMs = parseSwimTime(sanitized)
  if (!timeMs) return null

  const swimDate = date ?? meet.startsAt ?? meet.endsAt ?? meet.createdAt

  const base = normalizeSwimForInsert({
    athleteId: leadoffAthleteId,
    event: leadoffEvent,
    timeMs,
    course: meet.course,
    date: swimDate,
    meet: meet.name,
    meetId: meet.id || null,
    tags: leadoffSwimTags(relayEvent, relayRound, relayGender),
    source,
  })

  const existing = await prisma.swim.findFirst({
    where: leadoffSwimWhere(meet, leadoffAthleteId, leadoffEvent, relayEvent, relayRound, relayGender),
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

/**
 * A parsed relay's gender as its saved entry will read (effectiveRelayGender): the results' own
 * label, else "Mixed" in the event name, else from its matched swimmers' genders.
 */
function parsedRelayGender(
  row: ParsedRelayResult,
  lookup: ReturnType<typeof buildAthleteLookup>,
  nameMappings: Record<string, string> | null,
  athleteGenders: Map<string, RelayGender> | undefined
): RelayGender {
  const labeled = parseRelayGender(row.gender) || relayGenderFromEventName(row.event)
  if (labeled || !athleteGenders) return labeled
  return effectiveRelayGender(
    {
      athleteId: "",
      athleteName: "",
      event: row.event,
      eventNumber: 0,
      entryType: "relay_team",
      relaySwimmers: row.relaySwimmers.map((s) => ({
        leg: s.leg,
        name: s.name,
        athleteId: isRealRelaySwimmerName(s.name) ? (matchAthleteIdFast(s.name, lookup, nameMappings) ?? undefined) : undefined,
      })),
    },
    athleteGenders
  )
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
  athleteGenders,
}: {
  meetName: string
  meetId: string | null
  meetDate: Date
  course: Course
  relayResults: ParsedRelayResult[]
  roster: RosterAthlete[]
  source: string
  nameMappings?: Record<string, string> | null
  /** Roster genders, to tell a mixed relay the results don't label as one by its swimmers. */
  athleteGenders?: Map<string, RelayGender>
}): Promise<number> {
  const lookup = buildAthleteLookup(roster)
  const meet: MeetLike = meetId
    ? ((await prisma.meet.findUnique({ where: { id: meetId } })) ?? {
        id: meetId,
        name: meetName,
        course,
        startsAt: meetDate,
        endsAt: meetDate,
        createdAt: meetDate,
      })
    : {
        id: "",
        name: meetName,
        course,
        startsAt: meetDate,
        endsAt: meetDate,
        createdAt: meetDate,
      }

  const seen = new Set<string>()
  let imported = 0

  for (const row of relayResults) {
    // A DQ'd (or otherwise unfinished) relay's leadoff split isn't an official swim.
    if (parseSwimStatus(row.time)) continue
    const leg1 = row.relaySwimmers.find((s) => s.leg === 1)
    if (!leg1) continue
    const splitTime = sanitizeRelaySplitTime(leg1.splitTime)
    if (!splitTime || !isRealRelaySwimmerName(leg1.name)) continue

    const athleteId = matchAthleteIdFast(leg1.name, lookup, nameMappings)
    if (!athleteId) continue

    const leadoffEvent = leadoffEventFromRelay(row.event)
    if (!leadoffEvent) continue

    const relayRound = relayRoundFromTags(row.tags ?? "")
    const relayGender = parsedRelayGender(row, lookup, nameMappings, athleteGenders)
    const swimDate = row.date ? (parseMeetDate(row.date) ?? meetDate) : meetDate
    const key = `${athleteId}|${leadoffEvent}|${row.event}|${relayRound}|${relayGender}|${splitTime}|${swimDate.toISOString()}`
    if (seen.has(key)) continue
    seen.add(key)

    const created = await syncRelayLeadoffSwim(
      meet,
      row.event,
      athleteId,
      splitTime,
      source,
      swimDate,
      relayRound,
      relayGender
    )
    if (created) imported++
  }

  return imported
}
