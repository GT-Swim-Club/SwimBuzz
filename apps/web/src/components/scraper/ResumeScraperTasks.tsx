"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAthletePairing, type NameConfirmation, type RosterPairingOption } from "@/components/meet/AthletePairingProvider"
import { useImportTask } from "@/components/ui/ImportTaskProvider"
import {
  resumeScraperJob,
  resumedScraperProgress,
  SCRAPER_TASK_LABEL,
  summarizeScraperApply,
  type ScraperJobProgress,
} from "@/lib/scraper/scraper-job-client"
import { isScraperJobDismissed, scraperJobBusyElsewhere } from "@/lib/scraper/scraper-job-lock"

type ResumableJob = {
  id: string
  status: string
  error?: string | null
  applyKind: string | null
  progress?: ScraperJobProgress | null
}

const RETRY_MS = 8000
const MAX_TRIES = 3
/** Survives a dev remount so one reload doesn't open two toasts for the same job. */
const resumedJobIds = new Set<string>()

/**
 * The desktop scraper keeps working after a reload or a closed tab, and the
 * result is only saved when some open page finalizes the job. On load, bring
 * those toasts back and finish saving.
 */
export default function ResumeScraperTasks() {
  const router = useRouter()
  const { startTask } = useImportTask()
  const { requestPairing } = useAthletePairing()

  useEffect(() => {
    let cancelled = false
    let tries = 0
    let retryTimer: number | undefined

    const startJob = (job: ResumableJob) => {
      const kind = job.applyKind
      if (!kind || !SCRAPER_TASK_LABEL[kind]) return
      const label = SCRAPER_TASK_LABEL[kind]

      // A failure already had its toast. Bringing every recent one back stacks
      // the screen with errors the user already saw.
      if (job.status === "FAILED") return

      startTask(
        label,
        async (report) => {
          if (job.progress) {
            report(
              resumedScraperProgress(kind, { id: job.id, status: job.status, progress: job.progress })
            )
          }
          const data = await resumeScraperJob(job.id, kind, (polled) => report(resumedScraperProgress(kind, polled)))
          const confirmations = Array.isArray(data.nameConfirmations)
            ? (data.nameConfirmations as NameConfirmation[])
            : []
          if (kind === "swimphone_import" && confirmations.length > 0) {
            requestPairing({
              confirmations,
              roster: (data.rosterForPairing as RosterPairingOption[] | undefined) ?? [],
              description:
                "These names matched your team code but not the roster. Pair them to a roster athlete to import their results.",
              occurrenceNoun: ["result", "results"],
              submitVerb: "Import",
              taskLabel: "Importing paired results…",
              submit: async (nameMappings, rejectedNames) => {
                const res = await fetch("/api/meets/import/swimphone/finalize", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ jobId: job.id, nameMappings, rejectedNames }),
                })
                const paired = await res.json()
                if (!res.ok) throw new Error(paired.error ?? "Import failed")
                router.refresh()
                return summarizeScraperApply(kind, paired)
              },
              onSkip: () => router.refresh(),
            })
          }
          router.refresh()
          return summarizeScraperApply(kind, data)
        },
        { lifetime: "scraper" }
      )
    }

    const load = async () => {
      const res = await fetch("/api/scraper/jobs")
      if (!res.ok || cancelled) return
      const data = (await res.json()) as { jobs?: ResumableJob[] }
      const deferred: ResumableJob[] = []
      for (const job of data.jobs ?? []) {
        if (cancelled || resumedJobIds.has(job.id) || isScraperJobDismissed(job.id)) continue
        if (!job.applyKind || !SCRAPER_TASK_LABEL[job.applyKind]) continue
        if (scraperJobBusyElsewhere(job.id)) {
          deferred.push(job)
          continue
        }
        resumedJobIds.add(job.id)
        startJob(job)
      }
      if (deferred.length > 0 && tries < MAX_TRIES) {
        tries += 1
        retryTimer = window.setTimeout(() => void load(), RETRY_MS)
      }
    }

    void load()
    return () => {
      cancelled = true
      if (retryTimer != null) window.clearTimeout(retryTimer)
    }
  }, [requestPairing, router, startTask])

  return null
}
