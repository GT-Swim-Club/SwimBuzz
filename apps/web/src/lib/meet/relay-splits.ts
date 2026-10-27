import type { Course, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withRelaySplitSwims } from "../../../soft-delete-policy"
import { parseRelaySplitTag, RELAY_SPLIT_TAG_PREFIX, type RelayRound } from "@/lib/meet/relay-results"

/**
 * A relay split: one athlete's leg time on leg 2, 3 or 4 of a relay (after an exchange, so not a
 * flat start). Stored as a Swim tagged SPLIT|… that normal reads never see (soft-delete-policy.js),
 * so it never leaks into PBs, qualifiers or stats that expect flat-start swims. Splits come from
 * SwimBuzz meets' relay results (relay-split-sync.ts) and from SwimCloud meet pages. Leg 1 is a
 * real Swim (the relay lead-off) and is not included here.
 */
export type RelaySplit = {
  /** The split swim's id. */
  id: string
  athleteId: string
  /** Individual event the leg equals, e.g. "50 Fly" for leg 3 of a 200 Medley Relay. */
  event: string
  relayEvent: string
  relayRound: RelayRound
  /** Null when SwimCloud only says "Split" (leg 2 or 3 of a free relay). */
  leg: number | null
  course: Course
  timeMs: number
  date: Date
  /** The meet's name as recorded; SwimCloud meets outside SwimBuzz have no `meet`. */
  meetName: string
  meet: {
    id: string
    slug: string | null
    name: string
    iconUrl: string | null
    startsAt: Date
    endsAt: Date | null
    timeZone: string
  } | null
  source: string
}

const splitSelect = {
  id: true,
  athleteId: true,
  event: true,
  course: true,
  timeMs: true,
  date: true,
  tags: true,
  meet: true,
  source: true,
  meetRef: {
    select: { id: true, slug: true, name: true, iconUrl: true, startsAt: true, endsAt: true, timeZone: true },
  },
} satisfies Prisma.SwimSelect

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

  const swims = await withRelaySplitSwims(() =>
    prisma.swim.findMany({
      where: {
        tags: { startsWith: RELAY_SPLIT_TAG_PREFIX },
        ...(athleteIds ? { athleteId: { in: athleteIds } } : {}),
        ...(course ? { course } : {}),
        ...(since ? { date: { gte: since } } : {}),
      },
      select: splitSelect,
      orderBy: { date: "desc" },
    })
  )

  const splits: RelaySplit[] = []
  for (const swim of swims) {
    const tag = parseRelaySplitTag(swim.tags)
    if (!tag) continue
    splits.push({
      id: swim.id,
      athleteId: swim.athleteId,
      event: swim.event,
      relayEvent: tag.relayEvent,
      relayRound: tag.round,
      leg: tag.leg,
      course: swim.course,
      timeMs: swim.timeMs,
      date: swim.date,
      // The linked meet's current name; the swim's own copy is frozen at import.
      meetName: swim.meetRef?.name ?? swim.meet,
      meet: swim.meetRef,
      source: swim.source,
    })
  }
  return splits
}
