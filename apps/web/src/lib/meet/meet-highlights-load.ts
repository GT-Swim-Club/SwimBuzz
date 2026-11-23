import { prisma } from "@/lib/prisma"
import type { Course, Prisma } from "@prisma/client"
import type { MeetResultEntry, SheetEntry } from "@/lib/meet/meet-sheet-summary"
import {
  buildAthletePbMap,
  computeMeetResultHighlights,
  type MeetHighlights,
} from "@/lib/meet/meet-stats"
import {
  athletePreferredName,
  coerceTeamScores,
  ourTeamSides,
  teamOfAthletes,
  type MeetRecord,
  type MeetTeamHighlights,
  type TeamScores,
} from "@swimbuzz/shared"
import { loadMeetRecordsWithHolders } from "@/lib/records/meet-records"
import { coerceResultTeams } from "@/lib/meet/result-teams"

export type MeetForHighlights = {
  id: string
  season: string
  startsAt: Date
  /** Intrasquad or other unofficial meet: its swims still make PBs, but never nationals cuts. */
  unofficial?: boolean
  teamScores: unknown
  /** Each swimmer's team when the results name several of ours: splits the highlights per team. */
  resultTeams?: unknown
  swims: {
    id: string
    event: string
    course: string
    timeMs: number
    tags: string
    date: Date
    points: number | null
    athlete: { id: string; firstName: string; lastName: string; gender: string }
  }[]
}

/** A slice of the meet to compute highlights from: all of it, or one team's. */
type HighlightsPart = {
  results: MeetResultEntry[]
  swims: MeetForHighlights["swims"]
  relayResults: SheetEntry[] | null
  recordCount: number
  teamScores: TeamScores | null
}

/**
 * A meet's highlights carousel (team scores, top scorers, then result stats with any GTSC records
 * set here), loaded the same way for the web meet page and the API mobile reads. Null before
 * there's anything to show.
 */
export async function loadMeetHighlights({
  meet,
  results,
  relayResults,
  hasImportedResults,
  athleteHrefById,
}: {
  meet: MeetForHighlights
  results: MeetResultEntry[]
  relayResults: SheetEntry[] | null
  hasImportedResults: boolean
  athleteHrefById?: Map<string, string>
}): Promise<MeetHighlights | null> {
  const teamScores = coerceTeamScores(meet.teamScores)
  if (!hasImportedResults && meet.swims.length === 0 && !teamScores) return null

  const athleteIds = [
    ...new Set([...meet.swims.map((s) => s.athlete.id), ...results.map((r) => r.athleteId)]),
  ]
  // Relay legs too, so every name a highlight shows can be the athlete's preferred one.
  const namedIds = [
    ...new Set([
      ...athleteIds,
      ...(relayResults ?? []).flatMap((relay) =>
        (relay.relaySwimmers ?? []).map((leg) => leg.athleteId).filter((id): id is string => Boolean(id))
      ),
    ]),
  ]
  // "Before this meet" = other meets' swims dated before this meet's first swim. PBs, season bests
  // and new cuts are all judged against that window, so a later meet never changes this one's.
  const firstMeetSwimMs = meet.swims.reduce(
    (min, s) => Math.min(min, s.date.getTime()),
    meet.startsAt.getTime()
  )
  // Only this meet's swimmers, in the course(s) they swam here, are compared with earlier swims.
  const swimAthleteIds = [...new Set(meet.swims.map((s) => s.athlete.id))]
  const swimCourses = [...new Set(meet.swims.map((s) => s.course))]
  // Highlights only compare against each athlete × event × course's fastest earlier time, so let
  // Postgres return just those minimums — not every earlier swim (thousands of SwimCloud rows per
  // athlete), which made meet pages the bulk of the database's egress.
  const priorWhere = {
    athleteId: { in: swimAthleteIds },
    course: { in: swimCourses as Course[] },
    date: { lt: new Date(firstMeetSwimMs) },
    timeMs: { gt: 0 },
    // Not this meet's own swims; SwimCloud copies have no meet and always count.
    OR: [{ meetId: null }, { meetId: { not: meet.id } }],
  } satisfies Prisma.SwimWhereInput
  const priorSeasonWhere = {
    ...priorWhere,
    meetRef: { is: { season: meet.season } },
  } satisfies Prisma.SwimWhereInput
  const fastestBy = (where: Prisma.SwimWhereInput) =>
    swimAthleteIds.length > 0
      ? prisma.swim.groupBy({ by: ["athleteId", "event", "course"], where, _min: { timeMs: true } })
      : Promise.resolve([])
  const [priorBests, priorSeasonBests, priorSeasonCutBests, nationalsCuts, namedAthletes, records] = await Promise.all([
    fastestBy(priorWhere),
    fastestBy(priorSeasonWhere),
    // Relay leadoffs and unofficial meets never make a cut (isRelayLeadoffSwimTag).
    fastestBy({
      ...priorWhere,
      meetRef: { is: { season: meet.season, unofficial: false } },
      NOT: [{ tags: "R" }, { tags: { startsWith: "R|" } }],
    }),
    meet.unofficial
      ? Promise.resolve([])
      : prisma.nationalsCut.findMany({
          where: { isRelay: false, set: { season: meet.season } },
          select: { event: true, gender: true, timeMs: true, set: { select: { course: true } } },
        }),
    namedIds.length > 0
      ? prisma.athlete.findMany({
          where: { id: { in: namedIds } },
          select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
        })
      : [],
    loadMeetRecordsWithHolders(meet.id),
  ])
  const fastest = (rows: typeof priorBests) =>
    rows.flatMap((row) =>
      row._min.timeMs == null
        ? []
        : [{ athleteId: row.athleteId, event: row.event, course: row.course, timeMs: row._min.timeMs }]
    )

  const nameById = new Map(namedAthletes.map((a) => [a.id, athletePreferredName(a)]))
  const sortNameById = new Map(
    namedAthletes.map((a) => [a.id, `${a.lastName} ${a.preferredName?.trim() || a.firstName}`])
  )
  const genderById = new Map(namedAthletes.map((a) => [a.id, a.gender]))
  const priorBestMap = buildAthletePbMap(fastest(priorBests))
  const priorSeasonBestMap = buildAthletePbMap(fastest(priorSeasonBests))
  const priorSeasonCutSwims = fastest(priorSeasonCutBests)
  const cuts = nationalsCuts.map((c) => ({
    event: c.event,
    gender: c.gender,
    course: c.set.course,
    timeMs: c.timeMs,
  }))

  /**
   * Highlights from these results, swims, relays and records (all of them, or one team's). An
   * unofficial meet (an intrasquad) has no Top Performances list — its places aren't a real podium.
   */
  const compute = (part: HighlightsPart): MeetHighlights | null => {
    const computed = computeMeetResultHighlights({
      results: part.results,
      meetSwims: part.swims.map((s) => ({
        id: s.id,
        athleteId: s.athlete.id,
        event: s.event,
        course: s.course,
        timeMs: s.timeMs,
        athleteName: `${s.athlete.firstName} ${s.athlete.lastName}`,
        gender: s.athlete.gender,
        tags: s.tags,
        points: s.points,
      })),
      priorBestMap,
      nationalsCuts: cuts,
      priorSeasonBestMap,
      priorSeasonCutSwims,
      athleteHrefById,
      relayResults: part.relayResults,
      teamScores: part.teamScores,
      nameById,
      sortNameById,
      genderById,
      recordCount: part.recordCount,
    })
    return computed && meet.unofficial ? { ...computed, wins: [] } : computed
  }

  const highlights = compute({
    results,
    swims: meet.swims,
    relayResults,
    recordCount: records.length,
    teamScores,
  })
  if (!highlights) return null
  const allRecords = records.map(({ record }) => record)
  const teams = teamHighlights({
    resultTeams: coerceResultTeams(meet.resultTeams),
    teamScores,
    results,
    swims: meet.swims,
    relayResults,
    records,
    compute,
  })
  return {
    ...highlights,
    ...(allRecords.length > 0 ? { records: allRecords } : {}),
    ...(teams.length > 1 ? { teams } : {}),
  }
}

/**
 * Each of our teams' highlights at a meet whose results name several (an intrasquad's Gold and
 * White): the meet's results, swims, relays and records narrowed to that team's swimmers (a relay
 * by its swimmers' team), without team score cards. In combined standings order, else by name.
 * Empty when the swimmers' teams aren't known (results imported before teams were kept).
 */
function teamHighlights({
  resultTeams,
  teamScores,
  results,
  swims,
  relayResults,
  records,
  compute,
}: {
  resultTeams: Record<string, string>
  teamScores: TeamScores | null
  results: MeetResultEntry[]
  swims: MeetForHighlights["swims"]
  relayResults: SheetEntry[] | null
  records: { record: MeetRecord; athleteIds: string[] }[]
  compute: (part: HighlightsPart) => MeetHighlights | null
}): MeetTeamHighlights[] {
  const teams = [...new Set(Object.values(resultTeams))]
  if (teams.length < 2) return []

  // A relay's team: the one most of its known swimmers are on.
  const teamOf = (athleteIds: (string | undefined)[]) => teamOfAthletes(athleteIds, resultTeams)

  // Standings order: the combined line whose name holds every word of the team's ("GTSC Gold" for "Gold").
  const words = (team: string) => team.toLowerCase().split(/\s+/).filter(Boolean)
  const placeOf = (team: string) => {
    const standing = (teamScores?.combined ?? []).find((s) => {
      const name = new Set(words(s.team))
      return words(team).every((w) => name.has(w))
    })
    return standing?.place ?? Number.POSITIVE_INFINITY
  }
  const ordered = [...teams].sort((a, b) => placeOf(a) - placeOf(b) || a.localeCompare(b))
  const sides = ourTeamSides(ordered)

  return ordered.flatMap((team) => {
    const teamRecords = records.filter((r) => teamOf(r.athleteIds) === team)
    const highlights = compute({
      results: results.filter((r) => resultTeams[r.athleteId] === team),
      swims: swims.filter((s) => resultTeams[s.athlete.id] === team),
      relayResults: relayResults
        ? relayResults.filter((relay) => teamOf((relay.relaySwimmers ?? []).map((leg) => leg.athleteId)) === team)
        : null,
      recordCount: teamRecords.length,
      teamScores: null,
    })
    if (!highlights) return []
    return [
      {
        team: sides.get(team) ?? team,
        counters: highlights.counters,
        newNationalsCuts: highlights.newNationalsCuts ?? [],
        topScorers: highlights.topScorers ?? [],
        wins: highlights.wins ?? [],
        records: teamRecords.map(({ record }) => record),
      },
    ]
  })
}
