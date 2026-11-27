/**
 * Fill Meet.placeTimes (every event's champion, 8th and 24th place times across all teams) for
 * meets imported before results imports kept them, by re-parsing each meet's stored results PDF.
 * Read-only unless --apply.
 *
 *   node --env-file=.env scripts/backfill-place-times.mjs
 *       Dry run over every meet linked as a season's Nationals that has a results PDF.
 *   node --env-file=.env scripts/backfill-place-times.mjs --meet <meetId>
 *       Just that meet (any meet with a results PDF).
 *
 * Add --apply to save. Parses locally with `python3 -m pdf_parsers.cli` (run from apps/web, with the
 * repo's Python requirements installed), about 10–15 seconds a PDF. Uses its own Prisma client, so
 * it skips soft-deleted meets itself.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaClient } from "@prisma/client"

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const apply = args.includes("--apply")
const meetId = flag("--meet")

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const prisma = new PrismaClient()

const PLACE_TIME = /^\d{1,2}(?::\d{2})?\.\d{2}$|^\d{1,2}:\d{2}:\d{2}\.\d{2}$/
const time = (value) => (typeof value === "string" && PLACE_TIME.test(value.trim()) ? value.trim() : null)

/** The parser's place_times, keeping well-formed entries (as lib/meet/place-times.ts does). */
function coerceEvents(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((r) => r && (r.gender === "F" || r.gender === "M" || r.gender === "X") && typeof r.event === "string")
    .map((r) => ({
      gender: r.gender,
      event: r.event.trim(),
      relay: r.relay === true,
      champion: time(r.champion),
      eighth: time(r.eighth),
      twentyFourth: time(r.twentyFourth),
    }))
    .filter((r) => r.event && (r.champion || r.eighth || r.twentyFourth))
}

async function parseResults(url, course) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetching the results PDF failed (${res.status})`)
  const pdf = Buffer.from(await res.arrayBuffer())
  const run = spawnSync("python3", ["-m", "pdf_parsers.cli", "--kind", "results", "--course", course], {
    cwd: repoRoot,
    input: pdf,
    maxBuffer: 256 * 1024 * 1024,
  })
  if (run.status !== 0) throw new Error(`parser failed: ${run.stderr.toString().trim().slice(0, 300)}`)
  return JSON.parse(run.stdout.toString())
}

async function main() {
  const meets = meetId
    ? await prisma.meet.findMany({
        where: { id: meetId, deletedAt: null, resultsUrl: { not: null } },
        select: { id: true, name: true, season: true, resultsUrl: true },
      })
    : (
        await prisma.nationalsMeet.findMany({
          where: { meet: { deletedAt: null, resultsUrl: { not: null } } },
          select: { meet: { select: { id: true, name: true, season: true, resultsUrl: true } } },
          orderBy: { season: "asc" },
        })
      ).map((link) => link.meet)

  if (meets.length === 0) {
    console.log("No meets with a results PDF to backfill.")
    return
  }
  console.log(`${apply ? "Applying" : "Dry run"}: ${meets.length} meet(s)\n`)

  for (const meet of meets) {
    const label = `${meet.season} ${meet.name} (${meet.id})`
    try {
      // The parser reads the course off the PDF; SCY is only its fallback.
      const parsed = await parseResults(meet.resultsUrl, "SCY")
      const events = coerceEvents(parsed.place_times)
      console.log(`${label}: ${events.length} event(s) with place times`)
      for (const e of events.slice(0, 4)) {
        console.log(`    ${e.gender} ${e.event}: ${e.champion ?? "—"} / ${e.eighth ?? "—"} / ${e.twentyFourth ?? "—"}`)
      }
      if (apply && events.length > 0) {
        await prisma.meet.update({
          where: { id: meet.id },
          data: { placeTimes: { importedAt: new Date().toISOString(), events } },
        })
        console.log("    saved")
      }
    } catch (err) {
      console.error(`${label}: ${err instanceof Error ? err.message : err}`)
    }
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
