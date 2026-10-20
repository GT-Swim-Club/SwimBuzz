import type { Course, Prisma, PrismaClient } from "@prisma/client"
import { utcDayKey, zonedDayKey } from "@swimbuzz/shared"
import { normalizeEventName, parseMeetDate } from "@/lib/swim/swim-parse"

export type SwimInsert = {
  athleteId: string
  event: string
  timeMs: number
  course: Course
  date: Date | string
  meet?: string | null
  meetId?: string | null
  tags?: string | null
  place?: number | null
  source: string
}

export type SwimInsertWithOccurrence = Omit<SwimInsert, "date" | "meet" | "tags"> & {
  date: Date
  meet: string
  meetId: string | null
  tags: string
  occurrence: number
}

export function normalizeSwimDate(date: Date | string): Date {
  if (typeof date === "string") {
    return parseMeetDate(date) ?? new Date(date)
  }
  const day = date.toISOString().slice(0, 10)
  return parseMeetDate(day) ?? date
}

/** Base identity for a swim — meet name is not part of dedup (names vary by source). */
export function swimDedupKey(swim: {
  athleteId: string
  event: string
  timeMs: number
  course: string
  date: Date
  tags?: string | null
}): string {
  return [
    swim.athleteId,
    swim.event,
    swim.timeMs,
    swim.course,
    swim.date.toISOString(),
    swim.tags ?? "",
  ].join("\0")
}

export function swimIdentityWhere(
  swim: Omit<SwimInsertWithOccurrence, "occurrence" | "meet">
): Prisma.SwimWhereInput {
  return {
    athleteId: swim.athleteId,
    event: swim.event,
    timeMs: swim.timeMs,
    course: swim.course,
    date: swim.date,
    tags: swim.tags,
  }
}

export function normalizeSwimForInsert(swim: SwimInsert): Omit<SwimInsertWithOccurrence, "occurrence"> {
  return {
    ...swim,
    event: normalizeEventName(swim.event),
    timeMs: Math.round(swim.timeMs),
    date: normalizeSwimDate(swim.date),
    meet: swim.meet ?? "",
    meetId: swim.meetId ?? null,
    tags: swim.tags ?? "",
  }
}

export async function nextSwimOccurrence(
  db: Pick<PrismaClient, "swim">,
  swim: Omit<SwimInsertWithOccurrence, "occurrence">
): Promise<number> {
  const { meet: _meet, ...identity } = swim
  const agg = await db.swim.aggregate({
    where: swimIdentityWhere(identity),
    _max: { occurrence: true },
  })
  return (agg._max?.occurrence ?? -1) + 1
}

/**
 * Assign occurrence 0, 1, 2… for swims that share the same base identity in one import.
 * Re-imports still dedupe via skipDuplicates when occurrence 0 (etc.) already exists.
 */
export function assignSwimOccurrences(swims: SwimInsert[]): SwimInsertWithOccurrence[] {
  const nextOccurrence = new Map<string, number>()

  return swims.map((swim) => {
    const normalized = normalizeSwimForInsert(swim)
    const key = swimDedupKey(normalized)
    const occurrence = nextOccurrence.get(key) ?? 0
    nextOccurrence.set(key, occurrence + 1)
    return { ...normalized, occurrence }
  })
}

/** Inclusive "YYYY-MM-DD" days a meet spans, in the meet's own time zone. */
export type SwimDayRange = { start: string; end: string }

export function meetDayRange(meet: {
  startsAt: Date
  endsAt: Date | null
  timeZone: string
}): SwimDayRange {
  const start = zonedDayKey(meet.startsAt, meet.timeZone)
  const end = meet.endsAt ? zonedDayKey(meet.endsAt, meet.timeZone) : start
  return { start, end: end < start ? start : end }
}

export type CrossSourceSwim = {
  athleteId: string
  event: string
  timeMs: number
  course: string
  date: Date
  /** Days of the meet this swim belongs to, when known. */
  meetDays?: SwimDayRange | null
}

function crossSourceKey(swim: CrossSourceSwim): string {
  return [swim.athleteId, swim.event, swim.timeMs, swim.course].join("\0")
}

function withinMeetDays(range: SwimDayRange | null | undefined, day: string): boolean {
  return !!range && range.start <= day && day <= range.end
}

/**
 * Pair swims that are the same race recorded by different sources (SwimCloud
 * sync vs. meet results upload). Tags are ignored — SwimCloud flags (U, X, R)
 * and upload round markers (P, F, R|200 Free Relay|F) never agree — and dates
 * match exactly or by falling inside either swim's meet, since uploads may date
 * every swim to the meet's first day.
 *
 * Pairing is one-to-one, so identical prelim and final times each need their
 * own counterpart: a source with both swims leaves one unmatched when the
 * other source only recorded one.
 */
export function pairSameSwims<A extends CrossSourceSwim, B extends CrossSourceSwim>(
  incoming: A[],
  existing: B[]
): { unmatched: A[]; pairs: [A, B][] } {
  const pool = new Map<string, { swim: B; day: string; used: boolean }[]>()
  for (const swim of existing) {
    const key = crossSourceKey(swim)
    const bucket = pool.get(key) ?? []
    bucket.push({ swim, day: utcDayKey(swim.date), used: false })
    pool.set(key, bucket)
  }

  const pairs: [A, B][] = []
  const pending = incoming.map((swim) => ({ swim, day: utcDayKey(swim.date), paired: false }))

  // Exact-day pairs first so a window match can't take a swim's same-day twin.
  const passes = [
    (a: (typeof pending)[number], b: { swim: B; day: string }) => a.day === b.day,
    (a: (typeof pending)[number], b: { swim: B; day: string }) =>
      withinMeetDays(b.swim.meetDays, a.day) || withinMeetDays(a.swim.meetDays, b.day),
  ]
  for (const matches of passes) {
    for (const entry of pending) {
      if (entry.paired) continue
      const candidate = pool
        .get(crossSourceKey(entry.swim))
        ?.find((b) => !b.used && matches(entry, b))
      if (!candidate) continue
      candidate.used = true
      entry.paired = true
      pairs.push([entry.swim, candidate.swim])
    }
  }

  return { unmatched: pending.filter((e) => !e.paired).map((e) => e.swim), pairs }
}
