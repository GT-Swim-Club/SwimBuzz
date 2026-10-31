"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { RelativeInstantTime } from "@/components/ui/RelativeDate"
import { useScraperUi } from "@/components/scraper/ScraperUiProvider"
import { useImportTask, type ImportTaskProgress } from "@/components/ui/ImportTaskProvider"
import SetSwimCloudIdForm from "@/components/athlete/SetSwimCloudIdForm"
import {
  CLOUDFLARE_ALERT,
  scraperJobFraction,
  scraperRateLimitNotice,
  type ScraperJobStatusPayload,
} from "@/lib/scraper/scraper-job-client"
import { ICON_BUTTON } from "./AthleteIconButton"

/** Key/value box showing when times were last imported and the SwimCloud IDs. */
export function ImportInfoBox({
  timesSyncedAt,
  swimCloudIds,
}: {
  timesSyncedAt: string | null
  swimCloudIds: number[]
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border-secondary bg-fill-secondary px-4 py-3 text-[13px] leading-[18px]">
      <InfoRow label="Last imported">
        {timesSyncedAt ? <RelativeInstantTime at={timesSyncedAt} separator=", " /> : "Never"}
      </InfoRow>
      <InfoRow label={swimCloudIds.length > 1 ? "SwimCloud IDs" : "SwimCloud ID"}>
        <span className="font-mono tabular-nums">{swimCloudIds.join(", ")}</span>
      </InfoRow>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-foreground-tertiary">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  )
}

/** Toast progress for a single athlete's times-import scraper job, e.g. "100 Free SCY · 3/33". */
function athleteImportProgress(job: ScraperJobStatusPayload): ImportTaskProgress {
  if (job.status === "PENDING") return { detail: "Waiting for the scraper to start…" }
  if (job.status === "COMPLETED") return { detail: "Saving times…", progress: 1 }
  const progress = job.progress
  const profile =
    progress?.total && progress.total > 1 ? `Profile ${progress.current ?? 1}/${progress.total} · ` : ""
  return {
    detail:
      progress?.eventLabel && progress.events
        ? `${profile}${progress.eventLabel} · ${progress.event ?? 0}/${progress.events}`
        : undefined,
    alert: progress?.cloudflare ? CLOUDFLARE_ALERT : undefined,
    quiet: progress?.browserFocused,
    notice: scraperRateLimitNotice(progress),
    progress: scraperJobFraction(progress),
  }
}

/** History toolbar button: pull an athlete's new swims from SwimCloud via the desktop scraper. */
export default function ImportTimesButton({
  athleteId,
  swimCloudIds,
  timesSyncedAt,
}: {
  athleteId: string
  swimCloudIds: number[]
  timesSyncedAt: string | null
}) {
  const router = useRouter()
  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(timesSyncedAt)
  const linked = swimCloudIds.length > 0

  function runImport() {
    if (!linked || loading) return
    requireScraper(() => {
      const run = async (report: (progress: ImportTaskProgress) => void) => {
        setLoading(true)
        try {
          const { runScraperEnqueuePollFinalize } = await import("@/lib/scraper/scraper-job-client")
          const data = await runScraperEnqueuePollFinalize<{
            imported?: number
            timesSyncedAt?: string
            failedSwimCloudIds?: number[]
          }>({
            enqueue: () =>
              fetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ athleteId }),
              }),
            finalize: (jobId) =>
              fetch("/api/scrape/finalize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId }),
              }),
            onJob: (job) => report(athleteImportProgress(job)),
          })
          if (data.timesSyncedAt) setLastSynced(data.timesSyncedAt)
          router.refresh()

          const count = typeof data.imported === "number" ? data.imported : 0
          const failedIds = data.failedSwimCloudIds ?? []
          return `Imported ${count} new swim${count === 1 ? "" : "s"} from SwimCloud.${
            failedIds.length > 0
              ? ` SwimCloud profile ${failedIds.join(", ")} couldn't be scraped — try again later.`
              : ""
          }`
        } catch (err) {
          throw err instanceof Error ? err : new Error("Import failed — is the scraper running?")
        } finally {
          setLoading(false)
        }
      }

      startTask("Importing SwimCloud times…", run, { lifetime: "scraper" })
      setOpen(false)
    }, { continueLabel: "Import times" })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        aria-label="Import times from SwimCloud"
        className={`${ICON_BUTTON} h-[34px] w-[34px]`}
      >
        <AppIcon name="import" className="h-[18px] w-[18px]" />
        <HoverDetail label={loading ? "Importing times…" : "Import times from SwimCloud"} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import Times From SwimCloud"
        description={
          linked
            ? "Pulls any new swims from SwimCloud using the scraper. This usually takes 3–4 minutes."
            : "Link this athlete to SwimCloud to import their times."
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background-hover disabled:opacity-50"
            >
              {linked ? "Cancel" : "Close"}
            </button>
            {linked && (
              <button
                type="button"
                onClick={runImport}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                Import
              </button>
            )}
          </ModalFooter>
        }
      >
        {linked ? (
          <ImportInfoBox timesSyncedAt={lastSynced} swimCloudIds={swimCloudIds} />
        ) : (
          <SetSwimCloudIdForm athleteId={athleteId} />
        )}
      </Modal>
    </>
  )
}
