import { holdScraperJob, unholdScraperJob } from "@/lib/scraper/scraper-job-lock"

/**
 * Poll a scraper job until COMPLETED or FAILED, then optionally finalize.
 * Used by web UI and mirrored in @swimbuzz/api for mobile.
 */

export const CLOUDFLARE_ALERT = "Complete the Cloudflare check in the browser."

export const SWIMPHONE_VERIFICATION_ALERT =
  "This meet is archived. Fill in the email and reCAPTCHA form in the SwimPhone window on your computer to continue."

const FINALIZE_PATH: Record<string, string> = {
  times_sync: "/api/times/sync/finalize",
  athlete_scrape: "/api/scrape/finalize",
  swimphone_import: "/api/meets/import/swimphone/finalize",
  roster_sync: "/api/roster/sync/finalize",
}

export const SCRAPER_TASK_LABEL: Record<string, string> = {
  times_sync: "Importing SwimCloud times…",
  athlete_scrape: "Importing SwimCloud times…",
  swimphone_import: "Scraping meet…",
  roster_sync: "Importing SwimCloud roster…",
}

/** Live progress the desktop scraper reports while a job is RUNNING. */
export type ScraperJobProgress = {
  current?: number
  total?: number
  swimmerId?: number
  /** 1-based index of the SwimCloud event being fetched for the current swimmer. */
  event?: number
  /** Number of events fetched per swimmer. */
  events?: number
  /** Event being fetched, e.g. "100 Free SCY". */
  eventLabel?: string | null
  /** True while a Cloudflare check is blocking the scraper's browser window. */
  cloudflare?: boolean
  /** True while the scraper waits for the coach to clear SwimPhone's archived-meet email + reCAPTCHA form. */
  swimphoneVerification?: boolean
  /** Epoch ms when the scraper retries after SwimCloud rate-limited it (HTTP 429). */
  rateLimitedUntil?: number | null
}

/** Plain-language toast notice while SwimCloud is rate-limiting the scraper. */
export function scraperRateLimitNotice(
  progress: ScraperJobProgress | null | undefined
): string | undefined {
  if (!progress?.rateLimitedUntil) return undefined
  const seconds = Math.ceil((progress.rateLimitedUntil - Date.now()) / 1000)
  const resume =
    seconds <= 0
      ? "Picking back up now"
      : seconds < 60
        ? `Picking back up in ${seconds}s`
        : `Picking back up in about ${Math.round(seconds / 60)} min`
  return `SwimCloud is limiting how fast we can import. ${resume} — no action needed.`
}

/**
 * Overall 0–1 completion of a times scrape, counting the event currently being
 * fetched. Undefined until there's measurable progress (so the toast shows an
 * indeterminate bar rather than an empty track, e.g. during a Cloudflare check
 * or with an older scraper that only reports per-swimmer progress).
 */
export function scraperJobFraction(progress: ScraperJobProgress | null | undefined): number | undefined {
  if (!progress?.total) return undefined
  const swimmersDone = Math.max(0, (progress.current ?? 1) - 1)
  const eventPart = progress.events ? (progress.event ?? 0) / progress.events : 0
  const fraction = Math.min(1, (swimmersDone + eventPart) / progress.total)
  return fraction > 0 ? fraction : undefined
}

export type ScraperJobStatusPayload = {
  id: string
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | string
  error?: string | null
  progress?: ScraperJobProgress | null
  result?: unknown
  applyResult?: unknown
  appliedAt?: string | null
}

export async function pollScraperJob(
  jobId: string,
  options: {
    intervalMs?: number
    timeoutMs?: number
    fetchJob?: (id: string) => Promise<ScraperJobStatusPayload>
    /** Called after every poll, e.g. to surface progress in a toast. */
    onJob?: (job: ScraperJobStatusPayload) => void
  } = {}
): Promise<ScraperJobStatusPayload> {
  const intervalMs = options.intervalMs ?? 1500
  const timeoutMs = options.timeoutMs ?? 20 * 60 * 1000
  const fetchJob =
    options.fetchJob ??
    (async (id: string) => {
      const res = await fetch(`/api/scraper/jobs/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to poll scraper job")
      return data as ScraperJobStatusPayload
    })

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const job = await fetchJob(jobId)
    options.onJob?.(job)
    if (job.status === "COMPLETED" || job.status === "FAILED") {
      if (job.status === "FAILED") {
        throw new Error(job.error ?? "Run scraper failed")
      }
      return job
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(
    "Timed out waiting for your computer. Keep the scraper running and complete any Cloudflare check in the browser."
  )
}

/** Enqueue → poll → finalize. Follows `nextJobId` chains (e.g. roster M then F). */
export async function runScraperEnqueuePollFinalize<T extends Record<string, unknown>>(options: {
  enqueue: () => Promise<Response>
  finalize: (jobId: string) => Promise<Response>
  onJob?: (job: ScraperJobStatusPayload) => void
}): Promise<T> {
  const enqueueRes = await options.enqueue()
  const enqueueData = await enqueueRes.json()
  if (!enqueueRes.ok) {
    throw new Error(enqueueData.error ?? "Failed to start scraper job")
  }

  // Immediate sync result (e.g. no athletes to sync)
  if (!enqueueData.jobId) {
    return enqueueData as T
  }

  let jobId = enqueueData.jobId as string
  // This tab enqueued the job, so it keeps the toast even if another tab resumes.
  holdScraperJob(jobId, true)
  try {
    for (;;) {
      await pollScraperJob(jobId, { onJob: options.onJob })
      const finalizeRes = await options.finalize(jobId)
      const data = await finalizeRes.json()
      if (!finalizeRes.ok) {
        throw new Error(data.error ?? "Finalize failed")
      }
      if (data.nextJobId && data.done === false) {
        unholdScraperJob(jobId)
        jobId = data.nextJobId
        holdScraperJob(jobId, true)
        continue
      }
      return data as T
    }
  } finally {
    unholdScraperJob(jobId)
  }
}

/** Toast progress for a job picked back up after a reload, without the page's athlete list. */
export function resumedScraperProgress(kind: string, job: ScraperJobStatusPayload) {
  if (job.status === "PENDING") return { detail: "Waiting for the scraper to start…" }
  if (job.status === "COMPLETED") {
    const detail =
      kind === "roster_sync"
        ? "Saving roster…"
        : kind === "swimphone_import"
          ? "Saving results…"
          : "Saving times…"
    return { detail, progress: 1 }
  }

  const progress = job.progress
  if (kind === "swimphone_import") {
    let detail = "Reading SwimPhone results…"
    if (progress?.total) {
      detail = `${progress.current ?? 0}/${progress.total} event${progress.total === 1 ? "" : "s"}`
      if (progress.eventLabel) detail += ` · ${progress.eventLabel}`
    }
    return {
      detail,
      alert: progress?.swimphoneVerification ? SWIMPHONE_VERIFICATION_ALERT : undefined,
      progress: scraperJobFraction(progress),
    }
  }

  if (kind === "athlete_scrape") {
    const profile =
      progress?.total && progress.total > 1 ? `Profile ${progress.current ?? 1}/${progress.total} · ` : ""
    return {
      detail:
        progress?.eventLabel && progress.events
          ? `${profile}${progress.eventLabel} · ${progress.event ?? 0}/${progress.events}`
          : "Reading SwimCloud times…",
      alert: progress?.cloudflare ? CLOUDFLARE_ALERT : undefined,
      notice: scraperRateLimitNotice(progress),
      progress: scraperJobFraction(progress),
    }
  }

  const noun = kind === "roster_sync" ? "step" : "athlete"
  const total = progress?.total
  const detail = total
    ? `${progress?.current ?? 0}/${total} ${noun}${total === 1 ? "" : "s"}${progress?.eventLabel ? ` · ${progress.eventLabel}` : ""}`
    : kind === "roster_sync"
      ? "Reading SwimCloud roster…"
      : "Reading SwimCloud times…"
  return {
    detail,
    alert: progress?.cloudflare ? CLOUDFLARE_ALERT : undefined,
    notice: scraperRateLimitNotice(progress),
    progress: scraperJobFraction(progress),
  }
}

export function summarizeScraperApply(kind: string, data: Record<string, unknown>): string {
  if (kind === "times_sync") {
    const imported = Number(data.imported ?? 0)
    const athletesSynced = Number(data.athletesSynced ?? 0)
    const athletes = Number(data.athletes ?? 0)
    return `Imported ${imported} new swim${imported === 1 ? "" : "s"} from ${athletesSynced}/${athletes} athlete${athletes === 1 ? "" : "s"}.`
  }
  if (kind === "athlete_scrape") {
    const count = Number(data.imported ?? 0)
    const failed = Array.isArray(data.failedSwimCloudIds) ? data.failedSwimCloudIds : []
    return `Imported ${count} new swim${count === 1 ? "" : "s"} from SwimCloud.${
      failed.length > 0
        ? ` SwimCloud profile ${failed.join(", ")} couldn't be scraped — try again later.`
        : ""
    }`
  }
  if (kind === "swimphone_import") {
    const imported = Number(data.imported ?? 0)
    const unmatched = Number(data.unmatchedCount ?? 0)
    let summary = `Imported ${imported} new swim${imported === 1 ? "" : "s"}`
    if (unmatched > 0) summary += ` (${unmatched} unmatched)`
    if (data.captchaLimited) {
      summary += ". Some events were skipped because SwimPhone's archived-meet check wasn't completed"
    }
    return summary
  }
  if (kind === "roster_sync") {
    const linked = Number(data.linked ?? 0)
    return `Linked ${linked} SwimCloud profile${linked === 1 ? "" : "s"}.`
  }
  return "Import finished."
}

/** Poll a job that was already enqueued and save its result. Follows roster chains. */
export async function resumeScraperJob(
  jobId: string,
  kind: string,
  onJob?: (job: ScraperJobStatusPayload) => void
): Promise<Record<string, unknown>> {
  const path = FINALIZE_PATH[kind]
  if (!path) throw new Error("This import can't be resumed")

  let current = jobId
  holdScraperJob(current, true)
  try {
    for (;;) {
      await pollScraperJob(current, { onJob })
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: current }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Finalize failed")
      if (typeof data.nextJobId === "string" && data.done === false) {
        unholdScraperJob(current)
        current = data.nextJobId
        holdScraperJob(current, true)
        continue
      }
      return data
    }
  } finally {
    unholdScraperJob(current)
  }
}
