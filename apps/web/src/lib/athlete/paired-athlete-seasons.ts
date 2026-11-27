import { prisma } from "@/lib/prisma"
import {
  buildExactAthleteIndex,
  exactNameMatches,
  isRejectedPdfName,
} from "@/lib/athlete/athlete-match"

/** Adds `season` to each of these athletes who isn't on that season's roster yet. */
async function addAthletesToSeason(athleteIds: Iterable<string>, season: string): Promise<void> {
  const ids = [...new Set(athleteIds)]
  if (ids.length === 0) return
  const offRoster = await prisma.athlete.findMany({
    where: { id: { in: ids }, NOT: { seasons: { has: season } } },
    select: { id: true },
  })
  if (offRoster.length === 0) return
  await prisma.$transaction(
    offRoster.map((a) =>
      prisma.athlete.update({ where: { id: a.id }, data: { seasons: { push: season } } })
    )
  )
}

/**
 * Adds `season` to every coach-paired athlete who isn't on that season's roster yet. The pairing
 * dialog can search every season ("Search all seasons"), and the imports, relays and meet page all
 * match against the season roster — so run this before an import loads it.
 */
export async function addPairedAthletesToSeason(
  nameMappings: Record<string, string> | null | undefined,
  season: string
): Promise<void> {
  await addAthletesToSeason(Object.values(nameMappings ?? {}), season)
}

/**
 * A season with no roster yet (a past one whose roster was never imported): each results name
 * that is exactly one athlete's name, from any season, adds that athlete to it — before the import
 * reads the roster, so the rest of the import matches them as usual. Names shared by several
 * athletes, close spellings and rejected names are left for the coach to pair.
 *
 * `rosterless` is whether the season had no athletes, so pairing can offer every season's.
 */
export async function joinEmptySeasonFromOtherSeasons({
  season,
  names,
  rejectedNames,
}: {
  season: string
  names: string[]
  rejectedNames?: string[] | null
}): Promise<{ rosterless: boolean }> {
  const onRoster = await prisma.athlete.count({ where: { seasons: { has: season } } })
  if (onRoster > 0) return { rosterless: false }

  const athletes = await prisma.athlete.findMany({
    select: { id: true, firstName: true, lastName: true, preferredName: true },
  })
  const index = buildExactAthleteIndex(athletes)
  const matched = new Set<string>()
  for (const name of new Set(names.map((n) => n.trim()).filter(Boolean))) {
    if (isRejectedPdfName(name, rejectedNames)) continue
    const ids = exactNameMatches(name, index)
    if (ids.length === 1) matched.add(ids[0]!)
  }
  await addAthletesToSeason(matched, season)
  return { rosterless: true }
}
