/**
 * Seed Athlete.yearBySeason (academic year per season) from the legacy single Athlete.year: the
 * stored year goes on the athlete's newest season, and each earlier season steps back one year per
 * season between (SR → JR → SO → FR, "5" → "4" → "3"), using the shared stepping in
 * packages/shared/src/academic-year.ts. Earlier seasons the ladder can't reach
 * (before a first year, or a grad value like Masters/PhD) are left blank for staff to fill in.
 *
 * Only athletes whose yearBySeason is still empty are touched, so it's safe to re-run and never
 * overwrites a year staff or a roster import already set. Athlete.year is left as is.
 *
 * Until this runs the app already reads the legacy year the same way (effectiveYearBySeason), so
 * there's no gap; this just makes it stored. Run after `prisma db push` adds the column:
 *   node scripts/backfill-athlete-years.mjs           # dry run: prints what would change
 *   node scripts/backfill-athlete-years.mjs --apply   # writes
 */
import { register } from "node:module"
import { PrismaClient } from "@prisma/client"

register("./ts-source-loader.mjs", import.meta.url)

const { parseYearBySeason, seedYearBySeason } = await import("../../../packages/shared/src/academic-year.ts")

const apply = process.argv.includes("--apply")
const prisma = new PrismaClient()

async function main() {
  const athletes = await prisma.athlete.findMany({
    where: { year: { not: null } },
    select: { id: true, firstName: true, lastName: true, seasons: true, year: true, yearBySeason: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  let seeded = 0
  let skipped = 0
  for (const athlete of athletes) {
    if (Object.keys(parseYearBySeason(athlete.yearBySeason)).length > 0) {
      skipped++
      continue
    }
    const map = seedYearBySeason(athlete.year, athlete.seasons)
    if (Object.keys(map).length === 0) {
      skipped++
      continue
    }
    const label = `${athlete.lastName}, ${athlete.firstName}`
    const detail = Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([season, year]) => `${season}: ${year}`)
      .join(", ")
    console.log(`${apply ? "seed" : "would seed"}  ${label} (year "${athlete.year}") → ${detail}`)

    if (apply) {
      // Guarded on the map still being empty, so an edit made meanwhile wins.
      await prisma.athlete.updateMany({
        where: { id: athlete.id, yearBySeason: { equals: {} } },
        data: { yearBySeason: map },
      })
    }
    seeded++
  }

  console.log(
    `\n${apply ? "Seeded" : "Would seed"} ${seeded} athlete(s); skipped ${skipped} (already set or no seasons).` +
      (apply ? "" : "\nDry run — re-run with --apply to write.")
  )
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
