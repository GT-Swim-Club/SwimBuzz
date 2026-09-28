"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createApiClient } from "@swimbuzz/api"
import { recoveryCountdown } from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"

const api = createApiClient({})

const TONE_CLASS = {
  normal: "text-foreground-secondary",
  warning: "text-warning",
  expired: "text-error",
} as const

export default function DeletedPracticeActions({
  practiceId,
  title,
  purgeAfter,
  canRestore,
}: {
  practiceId: string
  title: string
  purgeAfter: string
  canRestore: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const countdown = recoveryCountdown(purgeAfter)

  async function restore() {
    setBusy(true)
    setError(null)
    try {
      await api.restoreDeleted("practice", practiceId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setBusy(false)
    }
  }

  async function purge() {
    setBusy(true)
    setError(null)
    try {
      await api.purgeDeleted("practice", practiceId)
      router.push("/practices")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium ${TONE_CLASS[countdown.tone]}`}>{countdown.label}</span>
        <button
          type="button"
          disabled={busy || !canRestore}
          onClick={() => void restore()}
          aria-label="Restore"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors disabled:opacity-40"
        >
          <ActionIcon kind="restore" className="h-5 w-5" />
          <HoverDetail label={busy ? "Restoring…" : "Restore"} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          aria-label="Delete permanently"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-error-border text-error rounded-lg bg-background hover:bg-error-bg transition-colors disabled:opacity-40"
        >
          <ActionIcon kind="delete" className="h-5 w-5" />
          <HoverDetail label="Delete permanently" />
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={busy}
        title={`Delete ${title} permanently?`}
        description="This can't be undone."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void purge()}
              disabled={busy}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </ModalFooter>
        }
      />
    </div>
  )
}
