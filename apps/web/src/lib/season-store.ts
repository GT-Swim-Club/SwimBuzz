import { latestSeason } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { currentSeason } from "@/lib/season"

// Per-instance memo so the upsert runs about once per rollover, not per request.
let ensuredThrough: string | null = null

/**
 * Season labels, latest first. Lazily creates the running season and, from
 * 1 June, the next one — so no cron or "new season" button is needed.
 */
export async function listSeasons(): Promise<string[]> {
  const latest = latestSeason()
  if (ensuredThrough !== latest) {
    await prisma.season.createMany({
      data: [...new Set([currentSeason(), latest])].map((label) => ({ label })),
      skipDuplicates: true,
    })
    ensuredThrough = latest
  }
  const seasons = await prisma.season.findMany({ orderBy: { label: "desc" } })
  return seasons.map((s) => s.label)
}
