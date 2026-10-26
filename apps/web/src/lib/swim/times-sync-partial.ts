import { Prisma, ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assignSwimOccurrences } from "@/lib/swim/swim-dedup"
import {
  swimsFromSwimCloudTimes,
  withoutRecordedSwims,
  type SwimCloudTime,
} from "@/lib/swim/swimcloud-import"

/** What a times-sync job's `applyContext` holds; `saved` grows as the scraper streams athletes in. */
export type TimesApplyContext = {
  kind: "times_sync"
  season: string
  athleteIds: string[]
  saved?: { imported: number; athleteIds: string[] }
}

const CHUNK_SIZE = 500
/** Generous ceiling for one swimmer's career times; guards the route against a runaway body. */
const MAX_TIMES_PER_SWIMMER = 20_000

export function asTimesApplyContext(ctx: unknown): TimesApplyContext | null {
  if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return null
  const { kind, athleteIds } = ctx as Partial<TimesApplyContext>
  return kind === "times_sync" && Array.isArray(athleteIds) ? (ctx as TimesApplyContext) : null
}

/**
 * Insert scraped SwimCloud times, skipping swims already recorded, so saving the
 * same times twice (streamed, then again at finalize) adds nothing the second time.
 */
export async function saveSwimCloudTimes(
  swims: ReturnType<typeof swimsFromSwimCloudTimes>
): Promise<number> {
  const swimsToInsert = await withoutRecordedSwims(assignSwimOccurrences(swims))
  let imported = 0
  for (let i = 0; i < swimsToInsert.length; i += CHUNK_SIZE) {
    const result = await prisma.swim.createMany({
      data: swimsToInsert.slice(i, i + CHUNK_SIZE),
      skipDuplicates: true,
    })
    imported += result.count
  }
  return imported
}

function isSwimCloudTime(value: unknown): value is SwimCloudTime {
  if (!value || typeof value !== "object") return false
  const { event, course, time } = value as Record<string, unknown>
  return typeof event === "string" && typeof course === "string" && typeof time === "string"
}

/**
 * Save one swimmer's times the moment the scraper finishes them, so a scraper that
 * dies partway keeps everyone it already got to. Returns false when the job is no
 * longer a running times sync, or the swimmer isn't one of its athletes.
 */
export async function saveStreamedSwimmerTimes(
  jobId: string,
  connectionId: string,
  swimmerId: number,
  rawTimes: unknown
): Promise<boolean> {
  if (!Array.isArray(rawTimes) || rawTimes.length > MAX_TIMES_PER_SWIMMER) return false
  const times = rawTimes.filter(isSwimCloudTime)

  const job = await prisma.scraperJob.findUnique({ where: { id: jobId } })
  if (
    !job ||
    job.connectionId !== connectionId ||
    job.status !== ScraperJobStatus.RUNNING ||
    job.type !== ScraperJobType.TIMES_BULK
  ) {
    return false
  }
  const ctx = asTimesApplyContext(job.applyContext)
  if (!ctx) return false

  const athlete = await prisma.athlete.findFirst({
    where: { id: { in: ctx.athleteIds }, swimCloudIds: { has: swimmerId } },
    select: { id: true },
  })
  if (!athlete) return false
  if (times.length === 0) return true

  const imported = await saveSwimCloudTimes(swimsFromSwimCloudTimes(times, athlete.id))
  await prisma.athlete.update({ where: { id: athlete.id }, data: { timesSyncedAt: new Date() } })

  // The scraper posts one swimmer at a time, so this read-modify-write doesn't race.
  const saved = ctx.saved ?? { imported: 0, athleteIds: [] }
  const next: TimesApplyContext = {
    ...ctx,
    saved: {
      imported: saved.imported + imported,
      athleteIds: [...new Set([...saved.athleteIds, athlete.id])],
    },
  }
  await prisma.scraperJob.update({
    where: { id: jobId },
    data: { applyContext: next as Prisma.InputJsonValue },
  })
  return true
}

/** "Saved 12 new swims from 3/10 athletes before it stopped." for a times sync that got partway. */
export function describePartialTimesSync(applyContext: unknown): string | null {
  const ctx = asTimesApplyContext(applyContext)
  if (!ctx?.saved || ctx.saved.athleteIds.length === 0) return null
  const { imported, athleteIds } = ctx.saved
  const total = ctx.athleteIds.length
  return `Saved ${imported} new swim${imported === 1 ? "" : "s"} from ${athleteIds.length}/${total} athlete${total === 1 ? "" : "s"} before it stopped.`
}
