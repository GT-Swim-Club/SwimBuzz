import { prisma } from "@/lib/prisma"
import type { MeetResultEntry, SheetEntry } from "@/lib/meet/meet-sheet-summary"
import {
  buildAthletePbMap,
  computeMeetResultHighlights,
  type MeetHighlights,
} from "@/lib/meet/meet-stats"
import { coerceTeamScores } from "@swimbuzz/shared"

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
 * A meet's highlights carousel (team scores, top scorers, then result stats), loaded the same
 * way for the web meet page and the API mobile reads. Null before there's anything to show.
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
  const [pbSwims, nationalsCuts] = await Promise.all([
    athleteIds.length > 0
      ? prisma.swim.findMany({
          where: { athleteId: { in: athleteIds } },
          select: {
            athleteId: true,
            event: true,
            course: true,
            timeMs: true,
            date: true,
            meetId: true,
          },
        })
      : [],
    prisma.nationalsCut.findMany({
      where: { isRelay: false, set: { season: meet.season } },
      select: { event: true, gender: true, timeMs: true, set: { select: { course: true } } },
    }),
  ])
  // "Before this meet" = other meets' swims dated before this meet's first swim.
  const firstMeetSwimMs = meet.swims.reduce(
    (min, s) => Math.min(min, s.date.getTime()),
    meet.startsAt.getTime()
  )
  const priorSwims = pbSwims.filter(
    (s) => s.meetId !== meet.id && s.date.getTime() < firstMeetSwimMs
  )

  return computeMeetResultHighlights({
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
    pbMap: buildAthletePbMap(pbSwims),
    priorPbMap: buildAthletePbMap(priorSwims),
    nationalsCuts: nationalsCuts.map((c) => ({
      event: c.event,
      gender: c.gender,
      course: c.set.course,
      timeMs: c.timeMs,
    })),
    athleteHrefById,
    relayResults,
    teamScores,
  })
}
