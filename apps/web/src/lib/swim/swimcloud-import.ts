import type { Prisma } from "@prisma/client"
import { utcDayKey } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { withRelaySplitSwims } from "../../../soft-delete-policy"
import { isRelaySplitSwimTag, RELAY_SPLIT_TAG_PREFIX } from "@/lib/meet/relay-results"
import {
  meetDayRange,
  pairSameSwims,
  type CrossSourceSwim,
  type SwimDayRange,
  type SwimInsertWithOccurrence,
} from "@/lib/swim/swim-dedup"
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
  /** A relay leg's meet days ("YYYY-MM-DD"), so a later sync can move it off a guessed day. */
  meetDays?: SwimDayRange
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
    relayMeetDays?: SwimDayRange
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
      // Not `meetDays`: that would let pairSameSwims match a leg to a different round's leg.
      ...(swim.meetDays ? { relayMeetDays: swim.meetDays } : {}),
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

/**
 * Move SwimCloud relay legs saved on a guessed day to the day a later sync read, so the re-read
 * leg pairs with its old row instead of being saved beside it. A leg matches on everything but its
 * day, which must fall within the leg's meet; nothing moves onto a day where its twin already is.
 */
export async function redateRelaySplits(
  swims: (SwimInsertWithOccurrence & { relayMeetDays?: SwimDayRange })[]
): Promise<number> {
  const legs = swims.filter((s) => s.relayMeetDays && isRelaySplitSwimTag(s.tags))
  if (legs.length === 0) return 0

  const existing = await withRelaySplitSwims(() =>
    prisma.swim.findMany({
      where: {
        tags: { startsWith: RELAY_SPLIT_TAG_PREFIX },
        athleteId: { in: [...new Set(legs.map((s) => s.athleteId))] },
        timeMs: { in: [...new Set(legs.map((s) => s.timeMs))] },
      },
      select: {
        id: true,
        athleteId: true,
        event: true,
        timeMs: true,
        course: true,
        tags: true,
        occurrence: true,
        date: true,
        source: true,
      },
    })
  )
  const identity = (s: Pick<SwimInsertWithOccurrence, "athleteId" | "event" | "timeMs" | "course" | "tags" | "occurrence">) =>
    [s.athleteId, s.event, s.timeMs, s.course, s.tags, s.occurrence].join("\0")
  const saved = new Map<string, { id: string; day: string; source: string }[]>()
  for (const swim of existing) {
    const key = identity(swim)
    saved.set(key, [...(saved.get(key) ?? []), { id: swim.id, day: utcDayKey(swim.date), source: swim.source }])
  }

  const moves: { id: string; date: Date }[] = []
  for (const leg of legs) {
    const copies = saved.get(identity(leg)) ?? []
    const day = utcDayKey(leg.date)
    if (copies.some((copy) => copy.day === day)) continue
    const { start, end } = leg.relayMeetDays!
    const stale = copies.find((copy) => copy.source === SWIMCLOUD_SOURCE && start <= copy.day && copy.day <= end)
    if (!stale) continue
    stale.day = day
    moves.push({ id: stale.id, date: leg.date })
  }
  if (moves.length > 0) {
    await prisma.$transaction(moves.map(({ id, date }) => prisma.swim.update({ where: { id }, data: { date } })))
  }
  return moves.length
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
