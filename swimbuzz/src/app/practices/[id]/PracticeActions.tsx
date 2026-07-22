"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { PracticeFormState } from "../PracticeEditor"
import type { PracticeEditLockInfo } from "@/lib/practice-edit-lock-shared"
import { broadcastPracticeEditLockChanged } from "@/lib/practice-edit-lock-client"
import Modal, { ModalFooter } from "@/components/Modal"

const iconCls = "h-3.5 w-3.5 shrink-0"

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconCls}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconCls}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function PublishIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconCls}
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function UnpublishIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={iconCls}
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

export default function PracticeActions({
  practiceId,
  initial,
  title,
  published,
  editLock,
  onEdit,
  onLockChange,
}: {
  practiceId: string
  initial: PracticeFormState
  title: string
  published: boolean
  editLock: PracticeEditLockInfo
  onEdit: (lockToken: string) => void
  onLockChange: (lock: PracticeEditLockInfo) => void
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmTakeOver, setConfirmTakeOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Any active lock blocks this tab until it takes over (other user or other tab).
  const lockedElsewhere = Boolean(editLock?.locked)
  const lockedByOtherUser = Boolean(editLock?.locked && !editLock.lockedByMe)
  const lockerName = editLock?.lockedBy?.name?.trim() || "Another coach"

  async function acquireLock(force = false): Promise<string | null> {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/practices/${practiceId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.lock) onLockChange(data.lock)
        setError(data.error ?? "Could not start editing")
        return null
      }
      onLockChange(data)
      broadcastPracticeEditLockChanged(practiceId)
      const token = typeof data.token === "string" ? data.token : null
      if (!token) {
        setError("Could not start editing")
        return null
      }
      return token
    } catch {
      setError("Something went wrong")
      return null
    } finally {
      setLoading(false)
    }
  }

  async function handleEdit() {
    const token = await acquireLock(false)
    if (token) onEdit(token)
  }

  async function confirmAndTakeOver() {
    const token = await acquireLock(true)
    if (token) {
      setConfirmTakeOver(false)
      onEdit(token)
    }
  }

  async function togglePublished(next: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/practices/${practiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...initial, published: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.lock) onLockChange(data.lock)
        setError(data.error ?? "Failed to update practice")
        setLoading(false)
        return
      }
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/practices/${practiceId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.lock) onLockChange(data.lock)
        setError(data.error ?? "Failed to delete practice")
        setLoading(false)
        return
      }
      router.push("/practices")
      router.refresh()
    } catch {
      setError("Something went wrong")
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        {published ? (
          <button
            type="button"
            onClick={() => togglePublished(false)}
            disabled={loading || lockedElsewhere}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border-secondary rounded-lg hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:bg-background-elevated transition-colors disabled:opacity-40"
          >
            <UnpublishIcon />
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => togglePublished(true)}
            disabled={loading || lockedElsewhere}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-text hover:bg-primary-hover transition-colors disabled:opacity-40"
          >
            <PublishIcon />
            Publish
          </button>
        )}
        {lockedElsewhere ? (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setConfirmTakeOver(true)
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border-secondary rounded-lg hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:bg-background-elevated transition-colors disabled:opacity-40"
          >
            <PencilIcon />
            Take over
          </button>
        ) : (
          <button
            type="button"
            onClick={handleEdit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border-secondary rounded-lg hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:bg-background-elevated transition-colors disabled:opacity-40"
          >
            <PencilIcon />
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          disabled={loading || lockedElsewhere}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border-secondary border-red-200 text-error rounded-lg hover:bg-red-50 dark:border-red-900/50 dark:text-error dark:hover:bg-red-950/40 transition-colors disabled:opacity-40"
        >
          <TrashIcon />
          Delete
        </button>
      </div>

      {lockedElsewhere && (
        <p className="text-xs text-amber-700 dark:text-amber-300 text-right">
          {lockedByOtherUser
            ? `${lockerName} is editing.`
            : "You're editing in another window."}
        </p>
      )}

      {error && !confirmDelete && !confirmTakeOver && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      </div>

      <Modal
        open={confirmTakeOver}
        onClose={() => setConfirmTakeOver(false)}
        closeDisabled={loading}
        title="Take over editing?"
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmTakeOver(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAndTakeOver}
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Taking over…" : "Take over"}
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-foreground-secondary dark:text-foreground-secondary">
          {lockedByOtherUser ? (
            <>
              <span className="font-medium text-foreground dark:text-zinc-200">{lockerName}</span> is
              currently editing this practice. Taking over will kick them out of the editor and
              discard any unsaved changes they have.
            </>
          ) : (
            <>
              You already have this practice open for editing in another tab. Taking over will kick
              that tab out of the editor and discard any unsaved changes there.
            </>
          )}
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        closeDisabled={loading}
        title="Delete practice"
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
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
        <p className="text-sm text-foreground-secondary dark:text-foreground-secondary">
          Permanently delete <span className="font-medium text-foreground">{title}</span> and all of its sets and
          comments? This cannot be undone.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </Modal>
    </>
  )
}
