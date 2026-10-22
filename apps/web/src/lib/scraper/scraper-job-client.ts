/**
 * Poll a scraper job until COMPLETED or FAILED, then optionally finalize.
 * Used by web UI and mirrored in @swimbuzz/api for mobile.
 */

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
  for (;;) {
    await pollScraperJob(jobId, { onJob: options.onJob })
    const finalizeRes = await options.finalize(jobId)
    const data = await finalizeRes.json()
    if (!finalizeRes.ok) {
      throw new Error(data.error ?? "Finalize failed")
    }
    if (data.nextJobId && data.done === false) {
      jobId = data.nextJobId
      continue
    }
    return data as T
  }
}
