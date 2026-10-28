import { Prisma, ScraperJobStatus, ScraperJobType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { assignSwimOccurrences } from "@/lib/swim/swim-dedup"
import {
  redateRelaySplits,
  swimsFromSwimCloudTimes,
  withoutRecordedSwims,
  type SwimCloudTime,
} from "@/lib/swim/swimcloud-import"
import { readSwimCloudProfile, recordSwimCloudMeetSyncs } from "@/lib/swim/swimcloud-meets"

/** What the scraper has streamed in so far; every athlete it finished lands in exactly one list. */
type StreamedSaved = {
  imported: number
  /** Athletes with times, saved. */
  athleteIds: string[]
  /** Athletes SwimCloud returned no times for. */
  noTimesAthleteIds?: string[]
  /** Athletes the scraper couldn't read (blocked, rate-limited, errored). */
  failedAthleteIds?: string[]
}

/** What a times-sync job's `applyContext` holds; `saved` grows as the scraper streams athletes in. */
export type TimesApplyContext = {
  kind: "times_sync"
  season: string
  athleteIds: string[]
  saved?: StreamedSaved
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
  // assignSwimOccurrences keeps order but drops relayMeetDays, which re-dating needs.
  const withOccurrences = assignSwimOccurrences(swims).map((swim, i) => ({
    ...swim,
    relayMeetDays: swims[i].relayMeetDays,
  }))
  await redateRelaySplits(withOccurrences)
  const swimsToInsert = (await withoutRecordedSwims(withOccurrences)).map(
    ({ relayMeetDays: _relayMeetDays, ...swim }) => swim
  )
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

/** A scraped profile's times (any shape the scraper sends), or null when it isn't one. */
export function swimCloudProfileTimes(raw: unknown): { times: SwimCloudTime[]; meetIds: number[] } | null {
  const profile = readSwimCloudProfile(raw)
  if (!profile || profile.times.length > MAX_TIMES_PER_SWIMMER) return null
  return { times: profile.times.filter(isSwimCloudTime), meetIds: profile.meetIds }
}

/**
 * Save one swimmer's times the moment the scraper finishes them, so a scraper that
 * dies partway keeps everyone it already got to. `failed` records a swimmer the scraper
 * couldn't read. Returns false when the job is no longer a running times sync, or the
 * swimmer isn't one of its athletes.
 */
export async function saveStreamedSwimmerTimes(
  jobId: string,
  connectionId: string,
  swimmerId: number,
  rawProfile: unknown,
  failed = false
): Promise<boolean> {
  const profile = failed ? { times: [], meetIds: [] } : swimCloudProfileTimes(rawProfile)
  if (!profile) return false
  const { times } = profile

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

  const saved: StreamedSaved = ctx.saved ?? { imported: 0, athleteIds: [] }
  let next: StreamedSaved
  if (failed) {
    next = { ...saved, failedAthleteIds: addId(saved.failedAthleteIds, athlete.id) }
  } else if (times.length === 0) {
    next = { ...saved, noTimesAthleteIds: addId(saved.noTimesAthleteIds, athlete.id) }
  } else {
    const imported = await saveSwimCloudTimes(swimsFromSwimCloudTimes(times, athlete.id))
    await prisma.athlete.update({ where: { id: athlete.id }, data: { timesSyncedAt: new Date() } })
    next = {
      ...saved,
      imported: saved.imported + imported,
      athleteIds: addId(saved.athleteIds, athlete.id),
    }
  }
  // Only once its swims are saved, so a failed save re-reads these meets next sync.
  if (!failed) await recordSwimCloudMeetSyncs(athlete.id, profile.meetIds)

  // The scraper posts one swimmer at a time, so this read-modify-write doesn't race.
  await prisma.scraperJob.update({
    where: { id: jobId },
    data: { applyContext: { ...ctx, saved: next } as Prisma.InputJsonValue },
  })
  return true
}

function addId(ids: string[] | undefined, id: string): string[] {
  return [...new Set([...(ids ?? []), id])]
}

/**
 * "Saved 12 new swims from 3/10 athletes before it stopped. 1 had no SwimCloud times. 2 couldn't be read."
 * for a times sync that got partway. An athlete with several profiles counts once, under what was saved.
 */
export function describePartialTimesSync(applyContext: unknown): string | null {
  const ctx = asTimesApplyContext(applyContext)
  if (!ctx?.saved) return null
  const { imported, athleteIds } = ctx.saved
  const others = (ids: string[] | undefined) => (ids ?? []).filter((id) => !athleteIds.includes(id)).length
  const noTimes = others(ctx.saved.noTimesAthleteIds)
  const failed = others(ctx.saved.failedAthleteIds)
  if (athleteIds.length === 0 && noTimes === 0 && failed === 0) return null

  const total = ctx.athleteIds.length
  const parts = [
    `Saved ${imported} new swim${imported === 1 ? "" : "s"} from ${athleteIds.length}/${total} athlete${total === 1 ? "" : "s"} before it stopped.`,
  ]
  if (noTimes > 0) parts.push(`${noTimes} had no SwimCloud times.`)
  if (failed > 0) parts.push(`${failed} couldn't be read (blocked or rate-limited); import them again.`)
  return parts.join(" ")
}
