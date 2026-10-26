"use client"

import { useRouter } from "next/navigation"
import {
  useAthletePairing,
  type NameConfirmation,
  type RosterPairingOption,
} from "@/components/meet/AthletePairingProvider"
import { useScraperUi } from "@/components/scraper/ScraperUiProvider"
import { useImportTask, type ImportTaskProgress } from "@/components/ui/ImportTaskProvider"
import {
  scraperJobFraction,
  SWIMPHONE_VERIFICATION_ALERT,
  type ScraperJobStatusPayload,
} from "@/lib/scraper/scraper-job-client"

/** Meet results import (SwimPhone scrape or results PDF) plus the athlete-pairing step. */

export type ResultsImportSource =
  | { kind: "pdf"; pdfUrl?: string; file?: File | null }
  | { kind: "swimphone"; url: string }

type ImportResult = {
  imported: number
  parsed: number
  matched: number
  unmatchedCount: number
  unmatched: { name: string; event: string; time: string }[]
  meetName?: string
  meetDate?: string
  captchaLimited?: boolean
  incompleteRelays?: string[]
  leadoffsImported?: number
  nameConfirmations?: NameConfirmation[]
  rosterForPairing?: RosterPairingOption[]
  cachedParse?: unknown
  /** Finished SwimPhone scrape; pairing re-applies its results instead of scraping again. */
  scraperJobId?: string
}

type ImportRun = {
  source: ResultsImportSource
  team: string
  course: string
}

function swimphoneImportProgress(job: ScraperJobStatusPayload): ImportTaskProgress {
  if (job.status === "PENDING") return { detail: "Waiting for the scraper to start…" }
  if (job.status === "COMPLETED") return { detail: "Saving results…", progress: 1 }
  const progress = job.progress
  let detail = "Reading SwimPhone results…"
  if (progress?.total) {
    detail = `${progress.current ?? 0}/${progress.total} event${progress.total === 1 ? "" : "s"}`
    if (progress.eventLabel) detail += ` · ${progress.eventLabel}`
  }
  return {
    detail,
    alert: progress?.swimphoneVerification ? SWIMPHONE_VERIFICATION_ALERT : undefined,
    quiet: progress?.browserFocused,
    progress: scraperJobFraction(progress),
  }
}

function buildImportSummary(data: ImportResult): string {
  let summary = `Imported ${data.imported} new swim${data.imported === 1 ? "" : "s"}`
  if (data.unmatchedCount > 0) {
    summary += ` (${data.unmatchedCount} unmatched)`
  }
  if (data.captchaLimited) {
    summary += ". Some events were skipped because SwimPhone's archived-meet check wasn't completed"
  }
  return summary
}

export function useResultsImport({ meetId, season }: { meetId?: string; season: string }) {
  const router = useRouter()
  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()
  const { requestPairing } = useAthletePairing()

  async function runPdfImport(
    run: ImportRun,
    opts?: { nameMappings?: Record<string, string>; rejectedNames?: string[]; cachedParse?: unknown }
  ) {
    const source = run.source as Extract<ResultsImportSource, { kind: "pdf" }>
    const pdfUrl = source.pdfUrl?.trim() ?? ""
    if (!opts?.cachedParse && !source.file && !pdfUrl) {
      throw new Error("Choose a PDF file or enter a PDF URL")
    }

    const body = new FormData()
    if (!opts?.cachedParse) {
      if (pdfUrl) body.append("pdfUrl", pdfUrl)
      else if (source.file) body.append("file", source.file, source.file.name)
    }
    body.append("course", run.course)
    body.append("team", run.team.trim())
    body.append("season", season)
    if (meetId) body.append("meetId", meetId)
    if (opts?.nameMappings) body.append("nameMappings", JSON.stringify(opts.nameMappings))
    if (opts?.rejectedNames?.length) body.append("rejectedNames", JSON.stringify(opts.rejectedNames))
    if (opts?.cachedParse) body.append("cachedParse", JSON.stringify(opts.cachedParse))

    const res = await fetch("/api/meets/import", { method: "POST", body })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Import failed")
    if (data.jobId) {
      const { pollScraperJob } = await import("@/lib/scraper/scraper-job-client")
      await pollScraperJob(data.jobId)
      const fin = await fetch("/api/meets/import/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: data.jobId }),
      })
      const finalized = await fin.json()
      if (!fin.ok) throw new Error(finalized.error ?? "Import failed")
      return finalized as ImportResult
    }
    return data as ImportResult
  }

  async function finalizeSwimphoneJob(
    jobId: string,
    pairing?: { nameMappings: Record<string, string>; rejectedNames: string[] }
  ): Promise<ImportResult> {
    const fin = await fetch("/api/meets/import/swimphone/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, ...pairing }),
    })
    const finalized = await fin.json()
    if (!fin.ok) throw new Error(finalized.error ?? "Import failed")
    return { ...finalized, scraperJobId: jobId }
  }

  async function runSwimphoneImport(
    run: ImportRun,
    report?: (progress: ImportTaskProgress) => void
  ) {
    const source = run.source as Extract<ResultsImportSource, { kind: "swimphone" }>
    const url = source.url.trim()
    if (!url) throw new Error("Paste a SwimPhone meet URL")

    const res = await fetch("/api/meets/import/swimphone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, season, meetId, team: run.team.trim() }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Import failed")
    if (data.jobId) {
      const { pollScraperJob } = await import("@/lib/scraper/scraper-job-client")
      await pollScraperJob(data.jobId, {
        onJob: report ? (job) => report(swimphoneImportProgress(job)) : undefined,
      })
      return finalizeSwimphoneJob(data.jobId)
    }
    return data as ImportResult
  }

  function handleImportResponse(run: ImportRun, data: ImportResult): string {
    const confirmations = data.nameConfirmations ?? []
    if (confirmations.length > 0) {
      const { cachedParse, scraperJobId } = data
      requestPairing({
        confirmations,
        roster: data.rosterForPairing ?? [],
        description:
          "These names matched your team code but not the roster. Pair them to a roster athlete to import their results.",
        occurrenceNoun: ["result", "results"],
        submitVerb: "Import",
        taskLabel: "Importing paired results…",
        submit: async (nameMappings, rejectedNames) => {
          let paired: ImportResult
          if (run.source.kind === "pdf") {
            paired = await runPdfImport(run, { nameMappings, rejectedNames, cachedParse })
          } else {
            if (!scraperJobId) throw new Error("Import the meet from SwimPhone again to pair athletes")
            paired = await finalizeSwimphoneJob(scraperJobId, { nameMappings, rejectedNames })
          }
          router.refresh()
          return buildImportSummary(paired)
        },
        onSkip: () => router.refresh(),
      })
    }
    router.refresh()
    return buildImportSummary(data)
  }

  /**
   * Run an import in the background task toast. `before` runs first (e.g. saving the
   * meet's other resources); SwimPhone imports wait for the desktop scraper.
   */
  function startImport(
    source: ResultsImportSource,
    {
      team,
      course,
      before,
      onStart,
      onSettled,
    }: {
      team: string
      course: string
      before?: () => Promise<unknown>
      /** Called once the import actually begins (after the scraper check). */
      onStart?: () => void
      onSettled?: (ok: boolean) => void
    }
  ) {
    const run: ImportRun = { source, team, course }
    const swimphone = source.kind === "swimphone"
    const go = () => {
      onStart?.()
      startTask(swimphone ? "Scraping meet…" : "Importing results…", (report) => {
        const importPromise = Promise.resolve(before?.())
          .then(() => (swimphone ? runSwimphoneImport(run, report) : runPdfImport(run)))
          .then((data) => handleImportResponse(run, data))
        importPromise.then(
          () => onSettled?.(true),
          () => onSettled?.(false)
        )
        return importPromise
      }, { lifetime: swimphone ? "scraper" : "request" })
    }
    if (swimphone) requireScraper(go, { continueLabel: "Import results" })
    else go()
  }

  return { startImport }
}
