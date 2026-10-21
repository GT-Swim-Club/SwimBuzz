"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { useScraperUi } from "@/components/scraper/ScraperUiProvider"
import SetSwimCloudIdForm from "@/components/athlete/SetSwimCloudIdForm"
import { formatDateTime } from "@/lib/utils"
import { ICON_BUTTON } from "./AthleteIconButton"

type Status = "idle" | "loading" | "done" | "error"

/** Key/value box showing when times were last imported and the SwimCloud ID. */
export function ImportInfoBox({
  timesSyncedAt,
  swimCloudId,
}: {
  timesSyncedAt: string | null
  swimCloudId: number
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border-secondary bg-fill-secondary px-4 py-3 text-[13px] leading-[18px]">
      <InfoRow label="Last imported">{timesSyncedAt ? formatDateTime(timesSyncedAt) : "Never"}</InfoRow>
      <InfoRow label="SwimCloud ID">
        <span className="font-mono tabular-nums">{swimCloudId}</span>
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

/** History toolbar button: pull an athlete's new swims from SwimCloud via the desktop scraper. */
export default function ImportTimesButton({
  athleteId,
  swimCloudId,
  timesSyncedAt,
}: {
  athleteId: string
  swimCloudId: number | null
  timesSyncedAt: string | null
}) {
  const router = useRouter()
  const { requireScraper } = useScraperUi()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [resultOpen, setResultOpen] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(timesSyncedAt)
  const loading = status === "loading"

  function runImport() {
    if (!swimCloudId || loading) return
    requireScraper(() => {
      void (async () => {
        setStatus("loading")
        setError(null)
        try {
          const { runScraperEnqueuePollFinalize } = await import("@/lib/scraper/scraper-job-client")
          const data = await runScraperEnqueuePollFinalize<{ imported?: number; timesSyncedAt?: string }>({
            enqueue: () =>
              fetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ athleteId, swimmerCloudId: swimCloudId }),
              }),
            finalize: (jobId) =>
              fetch("/api/scrape/finalize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId }),
              }),
          })
          setCount(typeof data.imported === "number" ? data.imported : 0)
          if (data.timesSyncedAt) setLastSynced(data.timesSyncedAt)
          setStatus("done")
          router.refresh()
        } catch (err) {
          setError(err instanceof Error ? err.message : "Import failed — is the scraper running?")
          setStatus("error")
        }
        setOpen(false)
        setResultOpen(true)
      })()
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
        <AppIcon name="download" className="h-[18px] w-[18px]" />
        <HoverDetail label={loading ? "Importing times…" : "Import times from SwimCloud"} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        busy={loading}
        title="Import Times From SwimCloud"
        description={
          swimCloudId
            ? "Pulls any new swims from SwimCloud using the scraper. This usually takes 1–2 minutes."
            : "Link this athlete to SwimCloud to import their times."
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background-hover disabled:opacity-50"
            >
              {swimCloudId ? "Cancel" : "Close"}
            </button>
            {swimCloudId != null && (
              <button
                type="button"
                onClick={runImport}
                disabled={loading}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? "Importing…" : "Import"}
              </button>
            )}
          </ModalFooter>
        }
      >
        {swimCloudId ? (
          <>
            <ImportInfoBox timesSyncedAt={lastSynced} swimCloudId={swimCloudId} />
            {loading && (
              <p className="text-[13px] text-foreground-secondary">
                Scraping SwimCloud events, typically 1–2 minutes…
              </p>
            )}
          </>
        ) : (
          <SetSwimCloudIdForm athleteId={athleteId} />
        )}
      </Modal>

      <Modal
        open={resultOpen && (status === "done" || status === "error")}
        onClose={() => setResultOpen(false)}
        title={status === "error" ? "Import failed" : "Import complete"}
        description={
          status === "error"
            ? error ?? "Something went wrong while importing times."
            : count === 1
              ? "1 new swim was imported from SwimCloud."
              : `${count} new swims were imported from SwimCloud.`
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setResultOpen(false)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-hover"
            >
              Done
            </button>
          </ModalFooter>
        }
      />
    </>
  )
}
