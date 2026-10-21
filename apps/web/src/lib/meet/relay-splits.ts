import type { Course, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  effectiveRelayRound,
  isRelayResultsSummary,
  leadoffSwimTags,
  relaySplitEventFromRelay,
  relayTeamKey,
  sanitizeRelaySplitTime,
  type RelayRound,
} from "@/lib/meet/relay-results"
import { parseSwimTime } from "@/lib/swim/swim-parse"

/**
 * A relay split: one athlete's leg time on leg 2, 3 or 4 of a relay (after an exchange, so not a
 * flat start). Read straight from the meet's relay results rather than stored as a Swim, so it
 * never leaks into PBs, qualifiers or stats that expect flat-start swims. Leg 1 is a real Swim
 * (the relay lead-off) and is not included here.
 */
export type RelaySplit = {
  /** Stable across loads: meet + relay team + leg. */
  id: string
  athleteId: string
  /** Individual event the leg equals, e.g. "50 Fly" for leg 3 of a 200 Medley Relay. */
  event: string
  relayEvent: string
  relayRound: RelayRound
  leg: number
  course: Course
  timeMs: number
  date: Date
  meet: {
    id: string
    slug: string | null
    name: string
    iconUrl: string | null
    startsAt: Date
    endsAt: Date | null
    timeZone: string
  }
}

const meetSelect = {
  id: true,
  slug: true,
  name: true,
  iconUrl: true,
  startsAt: true,
  endsAt: true,
  timeZone: true,
  course: true,
  relayResultsSummary: true,
} satisfies Prisma.MeetSelect

/** Relay splits for the given athletes (all when omitted), optionally one course and since a date. */
export async function loadRelaySplits({
  athleteIds,
  course,
  since,
}: {
  athleteIds?: string[]
  course?: Course
  since?: Date | null
} = {}): Promise<RelaySplit[]> {
  if (athleteIds && athleteIds.length === 0) return []
  const wanted = athleteIds ? new Set(athleteIds) : null

  const meets = await prisma.meet.findMany({
    where: {
      ...(course ? { course } : {}),
      ...(since ? { OR: [{ startsAt: { gte: since } }, { endsAt: { gte: since } }] } : {}),
      // One athlete (the profile page): let Postgres skip meets they didn't swim a relay at.
      ...(athleteIds?.length === 1
        ? {
            relayResultsSummary: {
              path: ["entries"],
              array_contains: [{ relaySwimmers: [{ athleteId: athleteIds[0] }] }],
            },
          }
        : {}),
    },
    select: meetSelect,
  })

  const splits: RelaySplit[] = []
  for (const meet of meets) {
    if (!isRelayResultsSummary(meet.relayResultsSummary)) continue
    for (const entry of meet.relayResultsSummary.entries) {
      const relayRound = effectiveRelayRound(entry)
      const teamKey = relayTeamKey(entry.event, entry.relayLetter, relayRound, entry.gender || "")
      for (const swimmer of entry.relaySwimmers ?? []) {
        if (!swimmer.athleteId || (wanted && !wanted.has(swimmer.athleteId))) continue
        const event = relaySplitEventFromRelay(entry.event, swimmer.leg)
        const splitTime = sanitizeRelaySplitTime(swimmer.splitTime)
        const timeMs = splitTime ? parseSwimTime(splitTime) : null
        if (!event || !timeMs) continue
        splits.push({
          id: `${meet.id}|${teamKey}|${swimmer.leg}`,
          athleteId: swimmer.athleteId,
          event,
          relayEvent: entry.event,
          relayRound,
          leg: swimmer.leg,
          course: meet.course,
          timeMs,
          date: meet.startsAt,
          meet: {
            id: meet.id,
            slug: meet.slug,
            name: meet.name,
            iconUrl: meet.iconUrl,
            startsAt: meet.startsAt,
            endsAt: meet.endsAt,
            timeZone: meet.timeZone,
          },
        })
      }
    }
  }
  if (splits.length === 0) return splits

  // Relay entries carry no date; the relay's lead-off swim does (the day it was swum).
  const leadoffs = await prisma.swim.findMany({
    where: { meetId: { in: [...new Set(splits.map((s) => s.meet.id))] }, tags: { startsWith: "R|" } },
    select: { meetId: true, tags: true, date: true },
  })
  const leadoffDates = new Map(leadoffs.map((swim) => [`${swim.meetId}|${swim.tags}`, swim.date]))
  for (const split of splits) {
    const date = leadoffDates.get(`${split.meet.id}|${leadoffSwimTags(split.relayEvent, split.relayRound)}`)
    if (date) split.date = date
  }

  return since ? splits.filter((s) => s.date >= since) : splits
}
