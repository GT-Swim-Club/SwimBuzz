"use client"

import { useState } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { ICON_BUTTON } from "./AthleteIconButton"
import { ImportInfoBox } from "./ImportTimesButton"

/** Athlete's own History toolbar button: ask a coach to import their times from SwimCloud. */
export default function RequestTimesImportButton({
  athleteId,
  swimCloudIds,
  timesSyncedAt,
}: {
  athleteId: string
  swimCloudIds: number[]
  timesSyncedAt: string | null
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function requestImport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/request-times-import`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to send times import request")
        return
      }
      setSent(true)
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        disabled={loading}
        aria-label="Request a times import"
        className={`${ICON_BUTTON} h-[34px] w-[34px]`}
      >
        <AppIcon name="import" className="h-[18px] w-[18px]" />
        <HoverDetail label={sent ? "Import requested" : "Request a times import"} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Request Times Import From SwimCloud"
        description="Asks a coach to import or reimport your times from SwimCloud."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background-hover disabled:opacity-50"
            >
              {sent || swimCloudIds.length === 0 ? "Done" : "Cancel"}
            </button>
            {!sent && swimCloudIds.length > 0 && (
              <button
                type="button"
                onClick={() => void requestImport()}
                disabled={loading}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? "Requesting…" : "Request import"}
              </button>
            )}
          </ModalFooter>
        }
      >
        {swimCloudIds.length > 0 ? (
          <ImportInfoBox timesSyncedAt={timesSyncedAt} swimCloudIds={swimCloudIds} />
        ) : (
          <p className="text-sm text-foreground-secondary">
            Your profile isn&apos;t linked to SwimCloud yet. Ask a coach to add your SwimCloud ID.
          </p>
        )}
        {sent && <p className="text-[13px] text-info">Import requested. A coach will run it soon.</p>}
        {error && <p className="text-[13px] text-error">{error}</p>}
      </Modal>
    </>
  )
}
