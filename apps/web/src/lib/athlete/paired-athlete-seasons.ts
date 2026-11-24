import { prisma } from "@/lib/prisma"

/**
 * Adds `season` to every coach-paired athlete who isn't on that season's roster yet. The pairing
 * dialog can search every season ("Search all seasons"), and the imports, relays and meet page all
 * match against the season roster — so run this before an import loads it.
 */
export async function addPairedAthletesToSeason(
  nameMappings: Record<string, string> | null | undefined,
  season: string
): Promise<void> {
  const ids = [...new Set(Object.values(nameMappings ?? {}))]
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
