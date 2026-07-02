import type { Course, Prisma, PrismaClient } from "@prisma/client"
import { normalizeEventName, parseMeetDate } from "@/lib/swim-parse"

export type SwimInsert = {
  athleteId: string
  event: string
  timeMs: number
  course: Course
  date: Date | string
  meet?: string | null
  tags?: string | null
  source: string
}

export type SwimInsertWithOccurrence = Omit<SwimInsert, "date" | "meet" | "tags"> & {
  date: Date
  meet: string
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
