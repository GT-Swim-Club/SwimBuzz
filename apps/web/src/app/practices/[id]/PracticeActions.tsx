"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { PracticeFormState } from "../PracticeEditor"
import type { PracticeEditLockInfo } from "@/lib/practice-edit-lock-shared"
import Modal, { ModalFooter } from "@/components/Modal"
import ActionIcon from "@/components/ActionIcon"
import HoverDetail from "@/components/HoverDetail"
import {
  broadcastPracticeEditLockChanged,
  storePracticeEditLockHandoff,
  broadcastPracticeEditLockYield,
} from "@/lib/practice-edit-lock-client"

const iconCls = "h-3.5 w-3.5 shrink-0"


function PublishIcon({ className = iconCls }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function UnpublishIcon({ className = iconCls }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
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
  attendanceHref,
  editLock,
  onEdit,
  onLockChange,
}: {
  practiceId: string
  initial: PracticeFormState
  title: string
  published: boolean
  attendanceHref: string
  editLock: PracticeEditLockInfo
  onEdit: () => void
  onLockChange: (lock: PracticeEditLockInfo) => void
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editLockPending, setEditLockPending] = useState<PracticeEditLockInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Any active lock blocks this tab until it takes over (other user or other tab).
  const lockedElsewhere = Boolean(editLock?.locked)
  const lockedByOtherUser = Boolean(editLock?.locked && !editLock.lockedByMe)
  const lockerName = editLock?.lockedBy?.name?.trim() || "Another coach"
  const pendingLockedByOtherUser = Boolean(
    editLockPending?.locked && !editLockPending.lockedByMe
  )
  const pendingLockerName = editLockPending?.lockedBy?.name?.trim() || "Another coach"

  async function acquireEditLock(force = false) {
    let openingEditor = false
    setLoading(true)
    setError(null)
    if (force) broadcastPracticeEditLockYield(practiceId)
    try {
      const res = await fetch("/api/practices/" + practiceId + "/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = (await res.json().catch(() => ({}))) as PracticeEditLockInfo & {
        error?: string
        lock?: PracticeEditLockInfo
      }
      if (!res.ok) {
        if (data.lock) {
          onLockChange(data.lock)
          setEditLockPending(data.lock)
          return
        }
        setError(data.error ?? "Could not start editing")
        return
      }
      if (!data.token) {
        setError("Could not start editing")
        return
      }
      storePracticeEditLockHandoff(practiceId, data)
      broadcastPracticeEditLockChanged(practiceId)
      openingEditor = true
      onEdit()
    } catch {
      setError("Something went wrong")
    } finally {
      if (!openingEditor) setLoading(false)
    }
  }

  function handleTakeover() {
    void acquireEditLock(true)
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
      <div
        className={`relative flex shrink-0 items-start ${lockedElsewhere ? "pb-8" : ""}`}
      >
        <div className="flex shrink-0 items-center gap-2">
        <Link
          href={attendanceHref}
          aria-label="Take attendance"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors"
        >
          <ActionIcon kind="attendance" className="h-5 w-5" />
          <HoverDetail label="Attendance" />
        </Link>
        {published ? (
          <button
            type="button"
            onClick={() => togglePublished(false)}
            disabled={loading || lockedElsewhere}
            aria-label="Unpublish practice"
            className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors disabled:opacity-40"
          >
            <UnpublishIcon className="h-5 w-5" />
            <HoverDetail label="Unpublish" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => togglePublished(true)}
            disabled={loading || lockedElsewhere}
            aria-label="Publish practice"
            className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-text hover:bg-primary-hover transition-colors disabled:opacity-40"
          >
            <PublishIcon className="h-5 w-5" />
            <HoverDetail label="Publish" />
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          disabled={loading}
          aria-label="Edit practice"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors disabled:opacity-40"
        >
          <ActionIcon kind="edit" className="h-5 w-5" />
          <HoverDetail label="Edit" />
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          disabled={loading || lockedElsewhere}
          aria-label="Delete practice"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-red-200 text-error rounded-lg bg-background hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-40"
        >
          <ActionIcon kind="delete" className="h-5 w-5" />
          <HoverDetail label="Delete" />
        </button>
      </div>

      {lockedElsewhere && (
        <p
          role="status"
          className="absolute top-10 right-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-800 shadow-sm dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-300" />
          {lockedByOtherUser
            ? `${lockerName} is editing.`
            : "You're editing in another window."}
        </p>
      )}

      {error && !confirmDelete && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      </div>

      <Modal
        open={editLockPending != null}
        onClose={() => setEditLockPending(null)}
        closeDisabled={loading}
        title="Practice is being edited"
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setEditLockPending(null)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleTakeover}
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving changes…" : "Take over"}
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-foreground-secondary dark:text-foreground-secondary">
          {pendingLockedByOtherUser ? (
            <>
              <span className="font-medium text-foreground">{pendingLockerName}</span> is currently editing
              <span className="font-medium text-foreground"> {title}</span>. Taking over will save
              their unsaved changes first.
            </>
          ) : (
            <>
              You already have <span className="font-medium text-foreground">{title}</span> open in
              another window. Taking over will save changes in that editor first.
            </>
          )}
        </p>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
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
