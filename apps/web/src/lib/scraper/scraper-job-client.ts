/**
 * Poll a scraper job until COMPLETED or FAILED, then optionally finalize.
 * Used by web UI and mirrored in @swimbuzz/api for mobile.
 */

export type ScraperJobStatusPayload = {
  id: string
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | string
  error?: string | null
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
    await pollScraperJob(jobId)
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
