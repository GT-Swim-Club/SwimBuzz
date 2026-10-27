import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withRelaySplitSwims } from "../../../soft-delete-policy"
import { isRelaySplitSwimTag, RELAY_SPLIT_TAG_PREFIX } from "@/lib/meet/relay-results"
import { meetDayRange, pairSameSwims, type CrossSourceSwim } from "@/lib/swim/swim-dedup"
import { normalizeEventName, parseCourse, parseMeetDate, parseSwimTime } from "@/lib/swim/swim-parse"

export const SWIMCLOUD_SOURCE = "swimcloud"

export type SwimCloudTime = {
  event: string
  course: string
  time: string
  date?: string
  meet?: string
  tags?: string
  place?: number | null
}

export function swimsFromSwimCloudTimes(
  times: SwimCloudTime[],
  athleteId: string
) {
  const swims: {
    athleteId: string
    event: string
    timeMs: number
    course: ReturnType<typeof parseCourse>
    date: Date
    meet: string | null
    tags: string | null
    place: number | null
    source: string
  }[] = []

  for (const swim of times) {
    const timeMs = parseSwimTime(swim.time)
    if (!timeMs) continue

    const date =
      parseMeetDate(swim.date?.trim() ?? "") ??
      (swim.date?.trim() ? new Date(swim.date.trim()) : null)
    if (!date || isNaN(date.getTime())) continue

    swims.push({
      athleteId,
      event: normalizeEventName(swim.event),
      timeMs,
      course: parseCourse(swim.event, swim.course),
      date,
      meet: swim.meet ?? null,
      tags: swim.tags ?? null,
      place: Number.isInteger(swim.place) && swim.place! > 0 ? swim.place! : null,
      source: SWIMCLOUD_SOURCE,
    })
  }

  return swims
}

const crossSourceSelect = {
  athleteId: true,
  event: true,
  timeMs: true,
  course: true,
  date: true,
  meetRef: { select: { startsAt: true, endsAt: true, timeZone: true } },
} as const

/**
 * Drop SwimCloud swims that are already recorded — by an earlier sync or by a
 * meet results upload that tagged or dated the same race differently. Relay
 * split swims (SPLIT|…) are only compared with other split swims, and flat
 * swims with flat swims (split swims are hidden from normal reads).
 */
export async function withoutRecordedSwims<T extends CrossSourceSwim & { tags?: string | null }>(
  swims: T[]
): Promise<T[]> {
  if (swims.length === 0) return swims

  const splits = swims.filter((s) => isRelaySplitSwimTag(s.tags ?? ""))
  if (splits.length > 0) {
    const flat = swims.filter((s) => !isRelaySplitSwimTag(s.tags ?? ""))
    const newSplits = await withRelaySplitSwims(() =>
      unrecorded(splits, { tags: { startsWith: RELAY_SPLIT_TAG_PREFIX } })
    )
    return [...(await unrecorded(flat)), ...newSplits]
  }
  return unrecorded(swims)
}

async function unrecorded<T extends CrossSourceSwim>(swims: T[], where: Prisma.SwimWhereInput = {}): Promise<T[]> {
  if (swims.length === 0) return swims

  const existing = await prisma.swim.findMany({
    where: {
      ...where,
      athleteId: { in: [...new Set(swims.map((s) => s.athleteId))] },
      timeMs: { in: [...new Set(swims.map((s) => s.timeMs))] },
    },
    select: crossSourceSelect,
  })

  return pairSameSwims(
    swims,
    existing.map(({ meetRef, ...swim }) => ({
      ...swim,
      meetDays: meetRef ? meetDayRange(meetRef) : null,
    }))
  ).unmatched
}

/**
 * Delete SwimCloud-synced copies of a meet's uploaded results; the upload
 * carries the meet link, place, and round the SwimCloud copy lacks.
 */
export async function removeSwimCloudCopiesOfMeet(meetId: string): Promise<number> {
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { startsAt: true, endsAt: true, timeZone: true },
  })
  if (!meet) return 0

  const results = await prisma.swim.findMany({
    where: { meetId, source: { not: SWIMCLOUD_SOURCE } },
    select: crossSourceSelect,
  })
  if (results.length === 0) return 0

  const copies = await prisma.swim.findMany({
    where: {
      source: SWIMCLOUD_SOURCE,
      athleteId: { in: [...new Set(results.map((s) => s.athleteId))] },
      timeMs: { in: [...new Set(results.map((s) => s.timeMs))] },
    },
    select: { id: true, ...crossSourceSelect },
  })
  if (copies.length === 0) return 0

  const meetDays = meetDayRange(meet)
  const { pairs } = pairSameSwims(
    copies,
    results.map((swim) => ({ ...swim, meetDays }))
  )
  if (pairs.length === 0) return 0

  const { count } = await prisma.swim.deleteMany({
    where: { id: { in: pairs.map(([copy]) => copy.id) } },
  })
  return count
}
