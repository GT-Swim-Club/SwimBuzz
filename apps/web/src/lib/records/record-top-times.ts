import type { Prisma, RecordGender, TeamRecord } from "@prisma/client"
import {
  athletePreferredName,
  currentSeason,
  isTopTimesMode,
  recordEventDef,
  seasonFromDate,
  TOP_TIMES_LIMIT,
  utcDayKey,
  type TeamRecordSwimmer,
  type TeamTopTimesResponse,
  type TopTimesMode,
} from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"
import { readRecordSwimmers } from "@/lib/records/record-rows"
import { RECORD_SWIM_WHERE, relayCandidates, swimmerOf, type Candidate } from "@/lib/records/record-sync"
import { recordLinks, requireEvent } from "@/lib/records/records"

/** One swim, relay or record row competing for a place in the top 10. */
type Entry = {
  key: string
  /** Who swam it, for performers: an athlete id, or the typed name of an unlinked record holder. */
  person: string
  timeMs: number
  year: number
  date: Date | null
  swimmers: TeamRecordSwimmer[]
  leadoff: boolean
  meetName: string | null
  meetId: string | null
  isRecord: boolean
}

const SWIM_SELECT = {
  id: true,
  athleteId: true,
  timeMs: true,
  date: true,
  tags: true,
  meetId: true,
  meetRef: { select: { name: true } },
  athlete: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
} satisfies Prisma.SwimSelect

type SwimRow = Prisma.SwimGetPayload<{ select: typeof SWIM_SELECT }>

const SWIM_ORDER: Prisma.SwimOrderByWithRelationInput[] = [{ timeMs: "asc" }, { date: "asc" }, { id: "asc" }]

function setDay(entry: Pick<Entry, "date" | "year">): number {
  return entry.date?.getTime() ?? Date.UTC(entry.year, 0, 1)
}

/** Fastest first; a tie goes to whoever swam it first, and a record row over the swim it matches. */
function compareEntries(a: Entry, b: Entry): number {
  return a.timeMs - b.timeMs || setDay(a) - setDay(b) || Number(b.isRecord) - Number(a.isRecord) || a.key.localeCompare(b.key)
}

/** Each person once, at their best. */
function bestPerPerson(entries: Entry[]): Entry[] {
  const seen = new Set<string>()
  return [...entries].sort(compareEntries).filter((entry) => !seen.has(entry.person) && !!seen.add(entry.person))
}

/** Fastest first with shared ranks for ties (1, 2, 2, 4), keeping everyone ranked inside the top 10. */
function ranked(entries: Entry[]): Array<Entry & { rank: number }> {
  const sorted = [...entries].sort(compareEntries)
  const out: Array<Entry & { rank: number }> = []
  for (const [i, entry] of sorted.entries()) {
    const rank = i > 0 && sorted[i - 1]!.timeMs === entry.timeMs ? out[i - 1]!.rank : i + 1
    if (rank > TOP_TIMES_LIMIT) break
    out.push({ ...entry, rank })
  }
  return out
}

/** The 10th place time — anything as fast still makes the list — or null when fewer than ten. */
function cutoffTime(entries: Entry[]): number | null {
  return [...entries].sort(compareEntries)[TOP_TIMES_LIMIT - 1]?.timeMs ?? null
}

function recordEntry(row: TeamRecord): Entry {
  const swimmers = readRecordSwimmers(row.swimmers)
  const holder = swimmers[0]
  const name = holder?.name.trim().toLowerCase()
  return {
    key: `record:${row.id}`,
    person: holder?.athleteId ?? (name ? `name:${name}` : `record:${row.id}`),
    timeMs: row.timeMs,
    year: row.year,
    date: row.date,
    swimmers,
    leadoff: row.leadoff,
    meetName: row.meetName,
    meetId: row.meetId,
    isRecord: true,
  }
}

function swimEntry(swim: SwimRow): Entry {
  return {
    key: `swim:${swim.id}`,
    person: swim.athleteId,
    timeMs: swim.timeMs,
    year: swim.date.getUTCFullYear(),
    date: swim.date,
    swimmers: [swimmerOf(swim.athlete)],
    leadoff: isRelayLeadoffSwimTag(swim.tags),
    meetName: swim.meetRef?.name ?? null,
    meetId: swim.meetId,
    isRecord: false,
  }
}

function relayEntry(candidate: Candidate): Entry {
  return {
    key: `relay:${candidate.relayKey}`,
    person: `relay:${candidate.relayKey}`,
    timeMs: candidate.timeMs,
    year: candidate.date.getUTCFullYear(),
    date: candidate.date,
    swimmers: candidate.swimmers,
    leadoff: false,
    meetName: candidate.meetName,
    meetId: candidate.meetId,
    isRecord: false,
  }
}

function holderNamed(name: string | undefined, athlete: SwimRow["athlete"]): boolean {
  const typed = name?.trim().toLowerCase()
  if (!typed) return false
  return typed === athletePreferredName(athlete).toLowerCase() || typed === `${athlete.firstName} ${athlete.lastName}`.toLowerCase()
}

/** A record row typed or seeded without its swim's link is that swim when time, year and holder agree. */
function isRecordedSwim(row: TeamRecord, swim: SwimRow): boolean {
  if (row.timeMs !== swim.timeMs || row.year !== swim.date.getUTCFullYear()) return false
  const holder = readRecordSwimmers(row.swimmers)[0]
  return holder?.athleteId ? holder.athleteId === swim.athleteId : holderNamed(holder?.name, swim.athlete)
}

/**
 * A record row takes on what its swim knows that the row doesn't: the meet, the date, and the
 * swimmer's link when the row names them (staff may have corrected the holder to someone else).
 */
function fillFromSwim(entry: Entry, swim: SwimRow): void {
  const holder = entry.swimmers[0]
  if (holder && !holder.athleteId && holderNamed(holder.name, swim.athlete)) {
    entry.swimmers = [{ ...holder, athleteId: swim.athleteId }, ...entry.swimmers.slice(1)]
    entry.person = swim.athleteId
  }
  if (!entry.meetName && swim.meetRef) {
    entry.meetName = swim.meetRef.name
    entry.meetId = swim.meetId
  }
  if (!entry.date && entry.year === swim.date.getUTCFullYear()) entry.date = swim.date
}

/**
 * The event's record rows as entries, each tied to the swim behind it so that swim isn't listed
 * twice. Returns the swim ids to leave out of the swim queries: those behind a record, and those
 * behind a record staff cleared (kept off the list like the record).
 */
async function individualRecordEntries(
  rows: TeamRecord[],
  where: Prisma.SwimWhereInput
): Promise<{ entries: Entry[]; excludedSwimIds: string[] }> {
  const active = rows.filter((row) => !row.dismissed)
  const unlinked = active.filter((row) => !row.swimId)
  const linkedIds = active.filter((row) => row.swimId).map((row) => row.swimId!)
  const swims =
    unlinked.length > 0 || linkedIds.length > 0
      ? await prisma.swim.findMany({
          where: {
            OR: [
              ...(unlinked.length > 0 ? [{ ...where, timeMs: { in: [...new Set(unlinked.map((row) => row.timeMs))] } }] : []),
              ...(linkedIds.length > 0 ? [{ id: { in: linkedIds } }] : []),
            ],
          },
          select: SWIM_SELECT,
          orderBy: SWIM_ORDER,
        })
      : []
  const byId = new Map(swims.map((swim) => [swim.id, swim]))

  const excluded = new Set(rows.map((row) => row.swimId).filter((id): id is string => !!id))
  const entries = active.map((row) => {
    const entry = recordEntry(row)
    const swim = row.swimId
      ? byId.get(row.swimId)
      : swims.find((s) => !excluded.has(s.id) && isRecordedSwim(row, s))
    if (swim) {
      excluded.add(swim.id)
      fillFromSwim(entry, swim)
    }
    return entry
  })
  return { entries, excludedSwimIds: [...excluded] }
}

/** The ten fastest swims (and record rows), plus any tied with the tenth. */
async function individualPerformances(where: Prisma.SwimWhereInput, records: Entry[]): Promise<Entry[]> {
  let swims = await prisma.swim.findMany({ where, select: SWIM_SELECT, orderBy: SWIM_ORDER, take: TOP_TIMES_LIMIT })
  let entries = [...records, ...swims.map(swimEntry)]
  // Ten swims fetched: tenth place is no slower than the last of them, so only swims tied with it can be missing.
  const cutoff = cutoffTime(entries)
  if (swims.length === TOP_TIMES_LIMIT && cutoff !== null && swims.at(-1)!.timeMs <= cutoff) {
    swims = await prisma.swim.findMany({
      where: { AND: [where, { timeMs: { lte: cutoff } }] },
      select: SWIM_SELECT,
      orderBy: SWIM_ORDER,
    })
    entries = [...records, ...swims.map(swimEntry)]
  }
  return entries
}

/** Each swimmer's best: the athletes with the ten fastest bests (plus ties), merged with record holders. */
async function individualPerformers(where: Prisma.SwimWhereInput, records: Entry[]): Promise<Entry[]> {
  async function bests(groups: Array<{ athleteId: string; _min: { timeMs: number | null } }>): Promise<Entry[]> {
    const best = new Map(groups.flatMap((g) => (g._min.timeMs != null ? [[g.athleteId, g._min.timeMs] as const] : [])))
    const swims =
      best.size > 0
        ? await prisma.swim.findMany({
            where: { AND: [where, { athleteId: { in: [...best.keys()] }, timeMs: { in: [...new Set(best.values())] } }] },
            select: SWIM_SELECT,
            orderBy: SWIM_ORDER,
          })
        : []
    return bestPerPerson([...records, ...swims.filter((s) => best.get(s.athleteId) === s.timeMs).map(swimEntry)])
  }

  const fastest = await prisma.swim.groupBy({
    by: ["athleteId"],
    where,
    _min: { timeMs: true },
    orderBy: { _min: { timeMs: "asc" } },
    take: TOP_TIMES_LIMIT,
  })
  const entries = await bests(fastest)
  // Athletes left out are no faster than the last one fetched, so only ties with the tenth can be missing.
  const cutoff = cutoffTime(entries)
  const last = fastest.at(-1)?._min.timeMs
  if (fastest.length < TOP_TIMES_LIMIT || cutoff === null || last == null || last > cutoff) return entries
  // Athletes with a swim this fast are those whose best is.
  const tied = await prisma.swim.groupBy({
    by: ["athleteId"],
    where: { AND: [where, { timeMs: { lte: cutoff } }] },
    _min: { timeMs: true },
    orderBy: { _min: { timeMs: "asc" } },
  })
  return bests(tied)
}

/** Our relay results in the event, merged with its record rows (a record's relay listed once). */
async function relayPerformances(gender: RecordGender, event: string, rows: TeamRecord[]): Promise<Entry[]> {
  const athletes = await prisma.athlete.findMany({
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const candidates = (await relayCandidates(new Map(athletes.map((a) => [a.id, a])))).filter(
    (c) => c.gender === gender && c.event === event
  )
  const used = new Set(rows.map((row) => row.relayKey).filter((key): key is string => !!key))
  const entries = rows
    .filter((row) => !row.dismissed)
    .map((row) => {
      const entry = recordEntry(row)
      if (!row.relayKey) {
        const match = candidates.find(
          (c) => !used.has(c.relayKey!) && c.timeMs === row.timeMs && c.date.getUTCFullYear() === row.year
        )
        if (match) {
          used.add(match.relayKey!)
          if (!entry.meetName) {
            entry.meetName = match.meetName
            entry.meetId = match.meetId
          }
          entry.date ??= match.date
        }
      }
      return entry
    })
  return [...entries, ...candidates.filter((c) => !used.has(c.relayKey!)).map(relayEntry)]
}

/**
 * An event's top 10 (SCY): imported swims and the event's records, current and past. Performers
 * lists each swimmer once at their best (an unlinked record holder counts by name); performances
 * lists the fastest swims. Relays are performances only. Ties share a rank.
 */
export async function teamTopTimes(gender: unknown, event: unknown, mode: unknown): Promise<TeamTopTimesResponse> {
  const key = requireEvent(gender, event)
  const def = recordEventDef(key.event, key.gender)!
  const shown: TopTimesMode = def.relay ? "performances" : isTopTimesMode(mode) ? mode : "performers"
  const rows = await prisma.teamRecord.findMany({ where: { course: "SCY", ...key } })

  let entries: Entry[]
  if (def.relay) {
    entries = await relayPerformances(key.gender, key.event, rows)
  } else {
    const base: Prisma.SwimWhereInput = {
      ...RECORD_SWIM_WHERE,
      event: key.event,
      timeMs: { gt: 0 },
      athlete: { is: { gender: key.gender as "M" | "F" } },
    }
    const { entries: records, excludedSwimIds } = await individualRecordEntries(rows, base)
    const where: Prisma.SwimWhereInput =
      excludedSwimIds.length > 0 ? { AND: [base, { id: { notIn: excludedSwimIds } }] } : base
    entries =
      shown === "performers" ? await individualPerformers(where, records) : await individualPerformances(where, records)
  }

  const top = ranked(shown === "performers" ? bestPerPerson(entries) : entries)
  const links = await recordLinks(top)
  const season = currentSeason()
  return {
    mode: shown,
    times: top.map((entry) => ({
      key: entry.key,
      rank: entry.rank,
      timeMs: entry.timeMs,
      year: entry.year,
      date: entry.date?.toISOString() ?? null,
      swimmers: entry.swimmers.map((swimmer) => ({
        ...swimmer,
        athleteSlug: swimmer.athleteId ? (links.athleteSlugs.get(swimmer.athleteId) ?? null) : null,
      })),
      leadoff: entry.leadoff,
      meetName: entry.meetName,
      meetSlug: entry.meetId ? (links.meetSlugs.get(entry.meetId) ?? null) : null,
      isRecord: entry.isRecord,
      isThisSeason: !!entry.date && seasonFromDate(utcDayKey(entry.date)) === season,
    })),
  }
}
