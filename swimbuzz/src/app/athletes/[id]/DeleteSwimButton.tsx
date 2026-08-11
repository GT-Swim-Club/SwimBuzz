"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Modal, { ModalFooter } from "@/components/Modal"
import ActionIcon from "@/components/ActionIcon"

type DeleteSwimButtonProps = {
  swimId: string
  event: string
  course: string
  timeLabel: string
  dateLabel: string
  meet?: string | null
}

export default function DeleteSwimButton({
  swimId,
  event,
  course,
  timeLabel,
  dateLabel,
  meet,
}: DeleteSwimButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, loading])

  async function handleDelete() {
    setLoading(true)
    const res = await fetch(`/api/swims/${swimId}`, { method: "DELETE" })
    setLoading(false)
    if (res.ok) {
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="p-1 rounded text-foreground-tertiary hover:text-error hover:bg-fill-secondary dark:hover:text-error dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors"
        aria-label="Delete swim"
      >
        <ActionIcon kind="delete" className="w-4 h-4" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Delete this swim?"
        description="This can't be undone."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border-border-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </ModalFooter>
        }
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
          <ActionIcon kind="delete" className="h-5 w-5 text-error dark:text-error" />
        </div>

        <div className="rounded-xl border border-border-secondary dark:border border-border-secondary bg-fill-secondary dark:bg-background-elevated px-4 py-3">
          <p className="font-medium text-foreground dark:text-foreground">
            {event}{" "}
            <span className="text-foreground-secondary dark:text-foreground-secondary">({course})</span>
          </p>
          <p className="mt-1 font-mono text-lg text-foreground dark:text-foreground">
            {timeLabel}
          </p>
          <p className="mt-1 text-xs text-foreground-tertiary dark:text-foreground-tertiary">
            {dateLabel}
            {meet ? ` · ${meet}` : ""}
          </p>
        </div>
      </Modal>
    </>
  )
}
