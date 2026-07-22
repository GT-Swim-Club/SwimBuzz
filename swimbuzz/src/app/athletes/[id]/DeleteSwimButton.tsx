"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Modal, { ModalFooter } from "@/components/Modal"

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 9.24A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-9.24.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
            clipRule="evenodd"
          />
        </svg>
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-error dark:text-error"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 9.24A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-9.24.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
              clipRule="evenodd"
            />
          </svg>
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
