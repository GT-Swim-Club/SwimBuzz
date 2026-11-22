import { prisma } from "@/lib/prisma"
import type { Course, Prisma } from "@prisma/client"
import type { MeetResultEntry, SheetEntry } from "@/lib/meet/meet-sheet-summary"
import {
  buildAthletePbMap,
  computeMeetResultHighlights,
  type MeetHighlights,
} from "@/lib/meet/meet-stats"
import { athletePreferredName, coerceTeamScores } from "@swimbuzz/shared"
import { loadMeetRecords } from "@/lib/records/meet-records"

export type MeetForHighlights = {
  id: string
  season: string
  startsAt: Date
  teamScores: unknown
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
    // Relay leadoffs never make a cut (isRelayLeadoffSwimTag).
    fastestBy({ ...priorSeasonWhere, NOT: [{ tags: "R" }, { tags: { startsWith: "R|" } }] }),
    prisma.nationalsCut.findMany({
      where: { isRelay: false, set: { season: meet.season } },
      select: { event: true, gender: true, timeMs: true, set: { select: { course: true } } },
    }),
    namedIds.length > 0
      ? prisma.athlete.findMany({
          where: { id: { in: namedIds } },
          select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
        })
      : [],
    loadMeetRecords(meet.id),
  ])
  const fastest = (rows: typeof priorBests) =>
    rows.flatMap((row) =>
      row._min.timeMs == null
        ? []
        : [{ athleteId: row.athleteId, event: row.event, course: row.course, timeMs: row._min.timeMs }]
    )

  const highlights = computeMeetResultHighlights({
    results,
    meetSwims: meet.swims.map((s) => ({
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
    priorBestMap: buildAthletePbMap(fastest(priorBests)),
    nationalsCuts: nationalsCuts.map((c) => ({
      event: c.event,
      gender: c.gender,
      course: c.set.course,
      timeMs: c.timeMs,
    })),
    priorSeasonBestMap: buildAthletePbMap(fastest(priorSeasonBests)),
    priorSeasonCutSwims: fastest(priorSeasonCutBests),
    athleteHrefById,
    relayResults,
    teamScores,
    nameById: new Map(namedAthletes.map((a) => [a.id, athletePreferredName(a)])),
    sortNameById: new Map(
      namedAthletes.map((a) => [a.id, `${a.lastName} ${a.preferredName?.trim() || a.firstName}`])
    ),
    genderById: new Map(namedAthletes.map((a) => [a.id, a.gender])),
    recordCount: records.length,
  })
  return highlights && records.length > 0 ? { ...highlights, records } : highlights
}
