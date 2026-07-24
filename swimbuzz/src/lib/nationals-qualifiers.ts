import { Course, Gender, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  canonicalizeStrokeEvent,
  compareRelayEvents,
  compareSwimEvents,
} from "@/lib/swim-parse"
import { isRelayLeadoffSwimTag } from "@/lib/relay-results"
import { isRelaySignupEvent } from "@/lib/meet-signup"
import { formatDisplayTime, formatTime, formatSwimDate } from "@/lib/utils"

export type NqtParsedCut = {
  event: string
  gender: "M" | "F"
  timeMs: number
  note?: string | null
  isRelay?: boolean
}

export type NqtTableRow = {
  women: string
  event: string
  men: string
}

export type NqtParseResult = {
  yearLabel?: string | null
  course?: string | null
  table?: NqtTableRow[]
  cuts: NqtParsedCut[]
}

export type QualifierRow = {
  athleteId: string
  firstName: string
  lastName: string
  gender: Gender
  event: string
  timeMs: number
  time: string
  cutMs: number
  cut: string
  course: Course
  meetId: string | null
  meetName: string
  date: string
}

export type QualifierAthlete = {
  athleteId: string
  firstName: string
  lastName: string
  nicknames: string[]
  gender: Gender
  events: QualifierRow[]
}

export type StandardsTableRow = {
  event: string
  women: string
  men: string
}

export function isNqtTable(value: unknown): value is NqtTableRow[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (row) =>
      row &&
      typeof row === "object" &&
      typeof (row as NqtTableRow).women === "string" &&
      typeof (row as NqtTableRow).event === "string" &&
      typeof (row as NqtTableRow).men === "string"
  )
}

/** Prefer PDF table rows; fall back to reconstructing from cuts. */
export function buildStandardsTable(
  table: unknown,
  cuts: { event: string; gender: Gender; timeMs: number; note: string | null; isRelay: boolean }[]
): StandardsTableRow[] {
  if (isNqtTable(table) && table.length > 0) {
    return table.map((row) => ({
      women: row.women,
      event: row.event,
      men: row.men,
    }))
  }

  const byEvent = new Map<string, StandardsTableRow & { isRelay: boolean }>()
  for (const cut of cuts) {
    const event = canonicalizeStrokeEvent(cut.event)
    const key = `${cut.isRelay ? "r" : "i"}:${event.toLowerCase()}`
    let row = byEvent.get(key)
    if (!row) {
      row = { event, women: "--", men: "--", isRelay: cut.isRelay }
      byEvent.set(key, row)
    }
    const cell = cut.note?.trim() || formatDisplayTime(formatTime(cut.timeMs))
    if (cut.gender === "F") row.women = cell
    else row.men = cell
  }

  return [...byEvent.values()]
    .sort((a, b) => {
      if (a.isRelay !== b.isRelay) return a.isRelay ? 1 : -1
      return a.isRelay
        ? compareRelayEvents(a.event, b.event)
        : compareSwimEvents(a.event, b.event)
    })
    .map(({ event, women, men }) => ({ event, women, men }))
}

function parseCourse(raw: string | null | undefined): Course | null {
  const upper = (raw ?? "").trim().toUpperCase()
  if (upper === "SCY" || upper === "Y") return Course.SCY
  if (upper === "LCM" || upper === "L") return Course.LCM
  if (upper === "SCM" || upper === "S") return Course.SCM
  return null
}

export function isNqtParseResult(value: unknown): value is NqtParseResult {
  if (!value || typeof value !== "object") return false
  const cuts = (value as NqtParseResult).cuts
  if (!Array.isArray(cuts)) return false
  return cuts.every(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof c.event === "string" &&
      (c.gender === "M" || c.gender === "F") &&
      typeof c.timeMs === "number"
  )
}

/** Persist parsed NQT cuts for a season + course (replaces existing set). */
export async function saveNationalsStandards(opts: {
  season: string
  course: Course
  sourceUrl?: string | null
  yearLabel?: string | null
  table?: NqtTableRow[] | null
  cuts: NqtParsedCut[]
}) {
  const cutRows = opts.cuts
    .filter((c) => c.timeMs > 0 && (c.gender === "M" || c.gender === "F"))
    .map((c) => ({
      event: canonicalizeStrokeEvent(c.event),
      gender: c.gender as Gender,
      timeMs: Math.round(c.timeMs),
      note: c.note?.trim() || null,
      isRelay: Boolean(c.isRelay ?? isRelaySignupEvent(c.event)),
    }))
    .filter((c) => c.event.length > 0)

  const table =
    opts.table && opts.table.length > 0
      ? opts.table.map((row) => ({
          women: row.women,
          event: row.event,
          men: row.men,
        }))
      : Prisma.JsonNull

  return prisma.$transaction(async (tx) => {
    const existing = await tx.nationalsStandardSet.findUnique({
      where: { season_course: { season: opts.season, course: opts.course } },
      select: { id: true },
    })
    if (existing) {
      await tx.nationalsCut.deleteMany({ where: { setId: existing.id } })
      await tx.nationalsStandardSet.delete({ where: { id: existing.id } })
    }

    return tx.nationalsStandardSet.create({
      data: {
        season: opts.season,
        course: opts.course,
        label: "Nationals",
        sourceUrl: opts.sourceUrl ?? null,
        yearLabel: opts.yearLabel ?? null,
        table,
        cuts: { create: cutRows },
      },
      include: { cuts: { orderBy: [{ isRelay: "asc" }, { event: "asc" }, { gender: "asc" }] } },
    })
  })
}

/**
 * Athletes on the season roster whose best swim (from meets in that season)
 * is at or under the Nationals cut for an individual event.
 */
export async function computeNationalsQualifiers(opts: {
  season: string
  course?: Course
  gender?: Gender | null
  includeRelays?: boolean
}): Promise<{
  set: {
    id: string
    season: string
    course: Course
    label: string
    sourceUrl: string | null
    yearLabel: string | null
    updatedAt: Date
    cutCount: number
  } | null
  qualifiers: QualifierAthlete[]
  qualifierCount: number
  eventCount: number
  standards: StandardsTableRow[]
}> {
  const setWhere: Prisma.NationalsStandardSetWhereInput = { season: opts.season }
  if (opts.course) setWhere.course = opts.course

  const sets = await prisma.nationalsStandardSet.findMany({
    where: setWhere,
    include: { cuts: true },
    orderBy: { course: "asc" },
  })

  // Prefer SCY when multiple courses and none specified.
  const set =
    (opts.course ? sets.find((s) => s.course === opts.course) : null) ??
    sets.find((s) => s.course === Course.SCY) ??
    sets[0] ??
    null

  if (!set) {
    return {
      set: null,
      qualifiers: [],
      qualifierCount: 0,
      eventCount: 0,
      standards: [],
    }
  }

  const standards = buildStandardsTable(set.table, set.cuts)

  const cuts = set.cuts.filter((c) => {
    if (!opts.includeRelays && c.isRelay) return false
    if (opts.gender && c.gender !== opts.gender) return false
    return true
  })

  const cutByKey = new Map<string, (typeof cuts)[number]>()
  for (const cut of cuts) {
    cutByKey.set(`${cut.gender}:${canonicalizeStrokeEvent(cut.event).toLowerCase()}`, cut)
  }

  const athletes = await prisma.athlete.findMany({
    where: {
      seasons: { has: opts.season },
      ...(opts.gender ? { gender: opts.gender } : {}),
    },
    select: { id: true, firstName: true, lastName: true, nicknames: true, gender: true },
  })
  if (athletes.length === 0 || cuts.length === 0) {
    return {
      set: {
        id: set.id,
        season: set.season,
        course: set.course,
        label: set.label,
        sourceUrl: set.sourceUrl,
        yearLabel: set.yearLabel,
        updatedAt: set.updatedAt,
        cutCount: set.cuts.length,
      },
      qualifiers: [],
      qualifierCount: 0,
      eventCount: 0,
      standards,
    }
  }

  const athleteIds = athletes.map((a) => a.id)
  const athleteById = new Map(athletes.map((a) => [a.id, a]))

  const swims = await prisma.swim.findMany({
    where: {
      athleteId: { in: athleteIds },
      course: set.course,
      meetRef: { season: opts.season },
    },
    select: {
      athleteId: true,
      event: true,
      timeMs: true,
      tags: true,
      date: true,
      meetId: true,
      meet: true,
      meetRef: { select: { id: true, name: true } },
    },
    orderBy: { timeMs: "asc" },
  })

  // Best qualifying swim per athlete+event (first = fastest due to order).
  type Best = {
    timeMs: number
    date: Date
    meetId: string | null
    meetName: string
  }
  const bestByAthleteEvent = new Map<string, Best>()

  for (const swim of swims) {
    if (isRelayLeadoffSwimTag(swim.tags ?? "")) continue
    const event = canonicalizeStrokeEvent(swim.event)
    if (!event || isRelaySignupEvent(event)) continue
    const athlete = athleteById.get(swim.athleteId)
    if (!athlete) continue
    const cut = cutByKey.get(`${athlete.gender}:${event.toLowerCase()}`)
    if (!cut) continue
    if (swim.timeMs > cut.timeMs) continue

    const key = `${swim.athleteId}:${event.toLowerCase()}`
    if (bestByAthleteEvent.has(key)) continue
    bestByAthleteEvent.set(key, {
      timeMs: swim.timeMs,
      date: swim.date,
      meetId: swim.meetRef?.id ?? swim.meetId,
      meetName: swim.meetRef?.name || swim.meet || "Meet",
    })
  }

  const byAthlete = new Map<string, QualifierAthlete>()
  const eventsQualified = new Set<string>()

  for (const [key, best] of bestByAthleteEvent) {
    const [athleteId, eventKey] = key.split(":") as [string, string]
    const athlete = athleteById.get(athleteId)
    if (!athlete) continue
    const cut = cutByKey.get(`${athlete.gender}:${eventKey}`)
    if (!cut) continue

    const row: QualifierRow = {
      athleteId: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      gender: athlete.gender,
      event: cut.event,
      timeMs: best.timeMs,
      time: formatDisplayTime(formatTime(best.timeMs)),
      cutMs: cut.timeMs,
      cut: formatDisplayTime(formatTime(cut.timeMs)),
      course: set.course,
      meetId: best.meetId,
      meetName: best.meetName,
      date: formatSwimDate(best.date),
    }

    eventsQualified.add(cut.event)
    let group = byAthlete.get(athlete.id)
    if (!group) {
      group = {
        athleteId: athlete.id,
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        nicknames: athlete.nicknames,
        gender: athlete.gender,
        events: [],
      }
      byAthlete.set(athlete.id, group)
    }
    group.events.push(row)
  }

  const qualifiers = [...byAthlete.values()]
    .map((a) => ({
      ...a,
      events: a.events.sort((x, y) => compareSwimEvents(x.event, y.event)),
    }))
    .sort((a, b) => {
      const name = a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      if (name !== 0) return name
      return a.gender.localeCompare(b.gender)
    })

  return {
    set: {
      id: set.id,
      season: set.season,
      course: set.course,
      label: set.label,
      sourceUrl: set.sourceUrl,
      yearLabel: set.yearLabel,
      updatedAt: set.updatedAt,
      cutCount: set.cuts.length,
    },
    qualifiers,
    qualifierCount: qualifiers.length,
    eventCount: eventsQualified.size,
    standards,
  }
}

export { parseCourse as parseNationalsCourse }
