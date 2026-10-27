import { prisma } from "@/lib/prisma"
import { withRelaySplitSwims } from "../../../soft-delete-policy"
import {
  effectiveRelayRound,
  isRelayResultsSummary,
  leadoffSwimTags,
  RELAY_SPLIT_TAG_PREFIX,
  relaySplitEventFromRelay,
  relaySplitSwimTags,
  sanitizeRelaySplitTime,
} from "@/lib/meet/relay-results"
import { meetDayRange, nextSwimOccurrence, normalizeSwimForInsert, pairSameSwims } from "@/lib/swim/swim-dedup"
import { SWIMCLOUD_SOURCE } from "@/lib/swim/swimcloud-import"
import { parseSwimTime } from "@/lib/swim/swim-parse"

/** Source of split swims read from a SwimBuzz meet's relay results (as for relay lead-offs). */
const RELAY_SOURCE = "relay"

type WantedSplit = { athleteId: string; event: string; timeMs: number; tags: string; date: Date }

/**
 * Make a meet's relay split swims (legs 2–4, tagged SPLIT|…) match its relay results: add new legs,
 * update changed ones, delete cleared ones. Call after every write to `relayResultsSummary`. Also
 * drops SwimCloud copies of those splits, since the meet's own results replace them.
 */
export async function syncMeetRelaySplitSwims(meetId: string): Promise<void> {
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { id: true, name: true, course: true, startsAt: true, endsAt: true, timeZone: true, relayResultsSummary: true },
  })
  if (!meet) return
  const entries = isRelayResultsSummary(meet.relayResultsSummary) ? meet.relayResultsSummary.entries : []

  // Relay entries carry no date; the relay's lead-off swim does (the day it was swum).
  const leadoffs = await prisma.swim.findMany({
    where: { meetId, tags: { startsWith: "R|" } },
    select: { tags: true, date: true },
  })
  const leadoffDates = new Map(leadoffs.map((swim) => [swim.tags, swim.date]))

  const wanted = new Map<string, WantedSplit>()
  for (const entry of entries) {
    const relayRound = effectiveRelayRound(entry)
    for (const swimmer of entry.relaySwimmers ?? []) {
      if (!swimmer.athleteId) continue
      const event = relaySplitEventFromRelay(entry.event, swimmer.leg)
      const splitTime = sanitizeRelaySplitTime(swimmer.splitTime)
      const timeMs = splitTime ? parseSwimTime(splitTime) : null
      if (!event || !timeMs) continue
      const tags = relaySplitSwimTags(entry.event, swimmer.leg, relayRound)
      const date = leadoffDates.get(leadoffSwimTags(entry.event, relayRound)) ?? meet.startsAt
      wanted.set(`${swimmer.athleteId}|${tags}`, { athleteId: swimmer.athleteId, event, timeMs, tags, date })
    }
  }

  await withRelaySplitSwims(async () => {
    const existing = await prisma.swim.findMany({
      where: { meetId, tags: { startsWith: RELAY_SPLIT_TAG_PREFIX } },
      select: { id: true, athleteId: true, event: true, timeMs: true, course: true, date: true, tags: true, meet: true },
      orderBy: { createdAt: "asc" },
    })

    const kept = new Map<string, (typeof existing)[number]>()
    const stale: string[] = []
    for (const swim of existing) {
      const key = `${swim.athleteId}|${swim.tags}`
      if (!wanted.has(key) || kept.has(key)) stale.push(swim.id)
      else kept.set(key, swim)
    }
    if (stale.length > 0) await prisma.swim.deleteMany({ where: { id: { in: stale } } })

    for (const [key, want] of wanted) {
      const base = normalizeSwimForInsert({
        ...want,
        course: meet.course,
        meet: meet.name,
        meetId: meet.id,
        source: RELAY_SOURCE,
      })
      const swim = kept.get(key)
      if (!swim) {
        await prisma.swim.create({ data: { ...base, occurrence: await nextSwimOccurrence(prisma, base) } })
        continue
      }
      const changed =
        swim.event !== base.event ||
        swim.timeMs !== base.timeMs ||
        swim.course !== base.course ||
        swim.date.getTime() !== base.date.getTime() ||
        swim.meet !== base.meet
      if (changed) {
        await prisma.swim.update({
          where: { id: swim.id },
          data: { event: base.event, timeMs: base.timeMs, course: base.course, date: base.date, meet: base.meet },
        })
      }
    }

    await removeSwimCloudSplitCopies(meet, [...wanted.values()])
  })
}

/** Delete SwimCloud-synced splits that are the same legs as the meet's own split swims. */
async function removeSwimCloudSplitCopies(
  meet: { course: string; startsAt: Date; endsAt: Date | null; timeZone: string },
  splits: WantedSplit[]
) {
  if (splits.length === 0) return
  const copies = await prisma.swim.findMany({
    where: {
      source: SWIMCLOUD_SOURCE,
      tags: { startsWith: RELAY_SPLIT_TAG_PREFIX },
      athleteId: { in: [...new Set(splits.map((s) => s.athleteId))] },
      timeMs: { in: [...new Set(splits.map((s) => s.timeMs))] },
    },
    select: { id: true, athleteId: true, event: true, timeMs: true, course: true, date: true },
  })
  if (copies.length === 0) return

  const meetDays = meetDayRange(meet)
  const { pairs } = pairSameSwims(
    copies,
    splits.map((split) => ({ ...split, course: meet.course, meetDays }))
  )
  if (pairs.length === 0) return
  await prisma.swim.deleteMany({ where: { id: { in: pairs.map(([copy]) => copy.id) } } })
}
