import type { Prisma, RecordGender, TeamRecord } from "@prisma/client"
import { unstable_cache } from "next/cache"
import {
  countsForRecords,
  currentSeason,
  isTopTimesMode,
  recordEventDef,
  seasonFromDate,
  TOP_TIMES_LIMIT,
  topTimesEventDefs,
  utcDayKey,
  type RecordEventDef,
  type TeamAllTopTimesResponse,
  type TeamRecordSwimmer,
  type TeamTopTime,
  type TeamTopTimesResponse,
  type TopTimesMode,
} from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"
import {
  holderNamed,
  isManualRecord,
  isRecordedRelay,
  isRecordedSwim,
  readRecordSwimmers,
  relayKeyInMeet,
  type RecordLinks,
} from "@/lib/records/record-rows"
import { RECORD_SWIM_WHERE, relayCandidates, swimmerOf, type AthleteName, type Candidate } from "@/lib/records/record-sync"
import { RecordInputError, recordLinks, requireEvent } from "@/lib/records/records"
import { TOP_TIMES_CACHE_TAG } from "@/lib/records/top-times-cache"

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
  /** The imported swim behind it (individual events), for opening its detail. */
  swimId: string | null
  /** Our relay result behind it ("meetId|team key", as Candidate.relayKey), for opening its detail. */
  relayKey: string | null
  isRecord: boolean
  /** A record row nothing imported backs (typed in from the records sheet). */
  manual: boolean
}

/** Only small columns: names come from the athlete and meet lists, loaded once (keeps egress down). */
const SWIM_SELECT = {
  id: true,
  event: true,
  athleteId: true,
  timeMs: true,
  date: true,
  tags: true,
  meetId: true,
} satisfies Prisma.SwimSelect

type AthleteRow = AthleteName
type SwimRow = Prisma.SwimGetPayload<{ select: typeof SWIM_SELECT }> & {
  athlete: AthleteRow
  meetRef: { name: string } | null
}

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
    swimId: row.swimId,
    relayKey: row.relayKey,
    isRecord: true,
    manual: isManualRecord(row),
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
    swimId: swim.id,
    relayKey: null,
    isRecord: false,
    manual: false,
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
    swimId: null,
    relayKey: candidate.relayKey,
    isRecord: false,
    manual: false,
  }
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
  // The row's swim opens on its own meet's page.
  if (swim.meetId && (!entry.meetId || entry.meetId === swim.meetId)) {
    entry.swimId = swim.id
    entry.meetId = swim.meetId
  } else {
    entry.swimId = null
  }
}

/**
 * The event's record rows and imported swims as entries. Each record row is tied to the swim behind
 * it so that swim isn't listed twice; swims behind a record staff cleared stay off the list like the
 * record. `swims` are the event's swims for the gender, fastest first.
 */
function individualEntries(rows: TeamRecord[], swims: SwimRow[]): Entry[] {
  const byId = new Map(swims.map((swim) => [swim.id, swim]))
  const excluded = new Set(rows.map((row) => row.swimId).filter((id): id is string => !!id))
  const records = rows
    .filter((row) => !row.dismissed)
    .map((row) => {
      const entry = recordEntry(row)
      const swim = row.swimId
        ? byId.get(row.swimId)
        : swims.find((s) => !excluded.has(s.id) && isRecordedSwim(row, s))
      if (swim) {
        excluded.add(swim.id)
        fillFromSwim(entry, swim)
      } else {
        // Its swim is gone (deleted, or its meet is): nothing to open.
        entry.swimId = null
      }
      return entry
    })
  return [...records, ...swims.filter((swim) => !excluded.has(swim.id)).map(swimEntry)]
}

/** Every athlete, by id: swim and relay names, and record holders matched by name. */
async function loadAthletes(): Promise<Map<string, AthleteRow>> {
  const athletes = await prisma.athlete.findMany({
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  return new Map(athletes.map((a) => [a.id, a]))
}

/** Every imported swim that counts for top times in these individual events, by event, fastest first. */
async function loadIndividualSwims(
  gender: "F" | "M",
  events: string[],
  athletes: Map<string, AthleteRow>
): Promise<Map<string, SwimRow[]>> {
  if (events.length === 0) return new Map()
  const [swims, meets] = await Promise.all([
    prisma.swim.findMany({
      where: { ...RECORD_SWIM_WHERE, event: { in: events }, timeMs: { gt: 0 }, athlete: { is: { gender } } },
      select: SWIM_SELECT,
      orderBy: SWIM_ORDER,
    }),
    prisma.meet.findMany({
      where: { course: "SCY", deletedAt: null },
      select: { id: true, name: true, unofficial: true },
    }),
  ])
  const meetNames = new Map(meets.map((meet) => [meet.id, meet.name]))
  const unofficialMeets = new Set(meets.filter((meet) => meet.unofficial).map((meet) => meet.id))
  const byEvent = new Map<string, SwimRow[]>()
  for (const swim of swims) {
    const athlete = athletes.get(swim.athleteId)
    if (!athlete) continue
    // Unofficial meets only count in 25s.
    const unofficial = !!swim.meetId && unofficialMeets.has(swim.meetId)
    if (!countsForRecords({ event: swim.event, unofficial })) continue
    const meetName = swim.meetId ? meetNames.get(swim.meetId) : undefined
    const row: SwimRow = { ...swim, athlete, meetRef: meetName ? { name: meetName } : null }
    byEvent.set(swim.event, [...(byEvent.get(swim.event) ?? []), row])
  }
  return byEvent
}

/** Our relay results in the event, merged with its record rows (a record's relay listed once). */
function relayPerformances(
  gender: RecordGender,
  event: string,
  rows: TeamRecord[],
  allCandidates: Candidate[]
): Entry[] {
  const candidates = allCandidates.filter((c) => c.gender === gender && c.event === event)
  const used = new Set(rows.map((row) => row.relayKey).filter((key): key is string => !!key))
  const entries = rows
    .filter((row) => !row.dismissed)
    .map((row) => {
      const entry: Entry = { ...recordEntry(row), swimId: null }
      // A linked record's relay is ours only while that result still exists.
      if (row.relayKey && !candidates.some((c) => c.relayKey === row.relayKey)) entry.relayKey = null
      if (!row.relayKey) {
        const match = candidates.find((c) => !used.has(c.relayKey!) && isRecordedRelay(row, c))
        if (match) {
          used.add(match.relayKey!)
          entry.relayKey = match.relayKey
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

type RankedEntry = Entry & { rank: number }

/**
 * One event's ranked top 10: `rows` are the event's SCY record rows, `swims` its imported swims
 * (individual events) and `relays` our relay results (relays).
 */
function eventTopEntries(
  def: RecordEventDef & { gender: RecordGender },
  shown: TopTimesMode,
  rows: TeamRecord[],
  swims: SwimRow[],
  relays: Candidate[]
): RankedEntry[] {
  const entries = def.relay ? relayPerformances(def.gender, def.event, rows, relays) : individualEntries(rows, swims)
  return ranked(shown === "performers" ? bestPerPerson(entries) : entries)
}

/**
 * A Top 10 time as cached: with its meet's id, so a read can show the meet's current name and slug
 * (a rename changes both) even when the cached list predates it. Dropped before it's sent.
 */
type CachedTopTime = TeamTopTime & { meetId: string | null }
type CachedAllTopTimes = Omit<TeamAllTopTimesResponse, "events"> & {
  events: Array<Omit<TeamAllTopTimesResponse["events"][number], "times"> & { times: CachedTopTime[] }>
}

function toTopTimes(top: RankedEntry[], links: RecordLinks, season: string): CachedTopTime[] {
  return top.map((entry) => ({
    meetId: entry.meetId,
    key: entry.key,
    rank: entry.rank,
    timeMs: entry.timeMs,
    year: entry.year,
    date: entry.date?.toISOString() ?? null,
    swimmers: entry.swimmers.map((swimmer) => ({
      ...swimmer,
      name: (swimmer.athleteId && links.athleteNames.get(swimmer.athleteId)) || swimmer.name,
      athleteSlug: swimmer.athleteId ? (links.athleteSlugs.get(swimmer.athleteId) ?? null) : null,
    })),
    leadoff: entry.leadoff,
    meetName: entry.meetName,
    meetSlug: entry.meetId ? (links.meetSlugs.get(entry.meetId) ?? null) : null,
    swimId: entry.swimId,
    relayKey: relayKeyInMeet(entry.relayKey, entry.meetId),
    isRecord: entry.isRecord,
    isThisSeason: !!entry.date && seasonFromDate(utcDayKey(entry.date)) === season,
    manual: entry.manual,
  }))
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
  const [rows, athletes] = await Promise.all([
    prisma.teamRecord.findMany({ where: { course: "SCY", ...key } }),
    loadAthletes(),
  ])
  const [swims, relays] = await Promise.all([
    def.relay ? new Map<string, SwimRow[]>() : loadIndividualSwims(key.gender as "F" | "M", [key.event], athletes),
    def.relay ? relayCandidates(athletes) : [],
  ])
  const top = eventTopEntries({ ...def, gender: key.gender }, shown, rows, swims.get(key.event) ?? [], relays)
  // Read fresh, so its meets' names and slugs are current; the meet id is only for the cached lists
  // (undefined drops it from the JSON).
  const times = toTopTimes(top, await recordLinks(top), currentSeason()).map((time) => ({ ...time, meetId: undefined }))
  return { mode: shown, times }
}

/**
 * Every record event's top 10 for women or men (the mixed relay included), as `teamTopTimes`
 * lists each one, ranked in memory from one load of the record rows, swims and relay results.
 */
async function teamAllTopTimes(gender: unknown, mode: unknown): Promise<CachedAllTopTimes> {
  if (gender !== "F" && gender !== "M") throw new RecordInputError("Gender must be F or M")
  const shownMode: TopTimesMode = isTopTimesMode(mode) ? mode : "performers"
  const defs = topTimesEventDefs(gender)
  const individualEvents = defs.filter((def) => !def.relay).map((def) => def.event)
  // A few loads in all, whatever the number of events: record rows, athletes, swims, relay results.
  const [rows, athletes, earliestMeet] = await Promise.all([
    prisma.teamRecord.findMany({ where: { course: "SCY", gender: { in: [gender, "X"] } } }),
    loadAthletes(),
    // The earliest imported meet the top 10s draw from: the export's "Nov 1, 2017 – …" span.
    prisma.meet.findFirst({
      where: { course: "SCY", deletedAt: null, swims: { some: RECORD_SWIM_WHERE } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    }),
  ])
  const [swims, relays] = await Promise.all([
    loadIndividualSwims(gender, individualEvents, athletes),
    relayCandidates(athletes),
  ])
  const tops = defs.map((def) =>
    eventTopEntries(
      def,
      def.relay ? "performances" : shownMode,
      rows.filter((row) => row.gender === def.gender && row.event === def.event),
      swims.get(def.event) ?? [],
      relays
    )
  )
  const links = await recordLinks(tops.flat())
  const season = currentSeason()
  return {
    gender,
    mode: shownMode,
    events: defs.map((def, i) => ({
      event: def.event,
      label: def.label,
      group: def.group,
      relay: def.relay,
      gender: def.gender,
      mode: def.relay ? "performances" : shownMode,
      times: toTopTimes(tops[i]!, links, season),
    })),
    since: earliestMeet?.startsAt.toISOString() ?? null,
  }
}

/**
 * `teamAllTopTimes`, cached across requests (and instances, on Vercel) until a records sync drops
 * it: each gender and mode is read from the database once per change rather than on every view or
 * PDF. A day at most, so "this season" turns over with the season.
 */
/** Bump when TeamAllTopTimesResponse's shape or an event label changes: cached entries outlive deploys. */
const TOP_TIMES_CACHE_VERSION = "9"

const cachedAllTopTimes = unstable_cache(
  (gender: "F" | "M", mode: TopTimesMode) => teamAllTopTimes(gender, mode),
  ["team-all-top-times", TOP_TIMES_CACHE_VERSION],
  { tags: [TOP_TIMES_CACHE_TAG], revalidate: 86_400 }
)

export async function teamAllTopTimesCached(gender: unknown, mode: unknown): Promise<TeamAllTopTimesResponse> {
  if (gender !== "F" && gender !== "M") throw new RecordInputError("Gender must be F or M")
  const cached = await cachedAllTopTimes(gender, isTopTimesMode(mode) ? mode : "performers")
  // Meet names and slugs are read fresh: renaming a meet must show (and link) right away, whether
  // or not the cached lists were dropped since.
  const meetIds = [...new Set(cached.events.flatMap((e) => e.times.map((t) => t.meetId)))].filter(
    (id): id is string => !!id
  )
  const meets = new Map(
    (await prisma.meet.findMany({ where: { id: { in: meetIds } }, select: { id: true, name: true, slug: true } })).map(
      (meet) => [meet.id, meet]
    )
  )
  return {
    ...cached,
    events: cached.events.map((event) => ({
      ...event,
      times: event.times.map(({ meetId, ...time }) => {
        const meet = meetId ? meets.get(meetId) : undefined
        return meet ? { ...time, meetName: meet.name, meetSlug: meet.slug ?? meet.id } : time
      }),
    })),
  }
}
