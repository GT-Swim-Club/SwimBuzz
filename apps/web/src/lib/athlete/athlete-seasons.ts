import { prisma } from "@/lib/prisma"
import { parseSeasonList } from "@/lib/season"
import { effectiveYearBySeason } from "@swimbuzz/shared"
import { athleteYearData } from "@/lib/athlete/athlete-year"

export class AthleteSeasonError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/**
 * Take an athlete off one or more seasons' rosters. Only `seasons` (and those seasons' years) change — their swims,
 * attendance, sign-ups and login stay. They must stay on at least one season; removing someone
 * entirely is the permanent delete.
 */
export async function removeAthleteSeasons(athleteId: string, remove: unknown): Promise<string[]> {
  const seasons = parseSeasonList(remove)
  if (seasons.length === 0) throw new AthleteSeasonError("Pick a season to remove", 400)

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { seasons: true, year: true, yearBySeason: true } })
  if (!athlete) throw new AthleteSeasonError("Not found", 404)

  if (seasons.some((season) => !athlete.seasons.includes(season))) {
    throw new AthleteSeasonError("Athlete isn't on that season's roster", 400)
  }
  const remaining = athlete.seasons.filter((season) => !seasons.includes(season))
  if (remaining.length === 0) {
    throw new AthleteSeasonError(
      "An athlete must stay on at least one season. Delete them to remove them entirely.",
      400
    )
  }

  // Only write if the list hasn't changed since it was read (a roster import running meanwhile).
  const { count } = await prisma.athlete.updateMany({
    where: { id: athleteId, seasons: { equals: athlete.seasons } },
    // A removed season's year goes with it.
    data: { seasons: remaining, ...athleteYearData(effectiveYearBySeason(athlete), remaining) },
  })
  if (count === 0) throw new AthleteSeasonError("This athlete's seasons just changed. Try again.", 409)
  return remaining
}
