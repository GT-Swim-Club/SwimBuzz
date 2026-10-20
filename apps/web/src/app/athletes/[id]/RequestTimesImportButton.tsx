"use client"

import { useState } from "react"
import Link from "next/link"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { ICON_BUTTON } from "./AthleteIconButton"
import { ImportInfoBox } from "./ImportTimesButton"

/** Athlete's own History toolbar button: ask a coach to import their times from SwimCloud. */
export default function RequestTimesImportButton({
  athleteId,
  swimCloudId,
  timesSyncedAt,
}: {
  athleteId: string
  swimCloudId: number | null
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
        <AppIcon name="download" className="h-[18px] w-[18px]" />
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
              {sent || swimCloudId == null ? "Done" : "Cancel"}
            </button>
            {!sent && swimCloudId != null && (
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
        {swimCloudId != null ? (
          <ImportInfoBox timesSyncedAt={timesSyncedAt} swimCloudId={swimCloudId} />
        ) : (
          <p className="text-sm text-foreground-secondary">
            Set your SwimCloud ID in{" "}
            <Link href="/settings" className="text-primary hover:text-primary-hover">
              Settings
            </Link>{" "}
            before requesting a times import.
          </p>
        )}
        {sent && <p className="text-[13px] text-info">Import requested. A coach will run it soon.</p>}
        {error && <p className="text-[13px] text-error">{error}</p>}
      </Modal>
    </>
  )
}
