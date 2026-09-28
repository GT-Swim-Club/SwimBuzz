"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { PracticeFormState } from "../PracticeEditor"
import type { PracticeEditLockInfo } from "@/lib/practice/practice-edit-lock-shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import {
  broadcastPracticeEditLockChanged,
  storePracticeEditLockHandoff,
  broadcastPracticeEditLockYield,
} from "@/lib/practice/practice-edit-lock-client"
import { practiceEditPath } from "@/lib/slug"
import { deletePractice, duplicatePractice, setPracticePublished } from "./PracticeActions.actions"

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

function DuplicateIcon({ className = iconCls }: { className?: string }) {
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
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const [editLockPending, setEditLockPending] = useState<PracticeEditLockInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [duplicating, setDuplicating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = loading || isPending || duplicating

  // Any active lock blocks this tab until it takes over (other user or other tab).
  const lockedElsewhere = Boolean(editLock?.locked)
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

  function togglePublished(next: boolean) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await setPracticePublished(practiceId, initial, next)
        if (!result.ok) {
          if (result.lock) onLockChange(result.lock)
          setError(result.error)
          return
        }
        setConfirmPublish(false)
        setConfirmUnpublish(false)
      } catch {
        setError("Something went wrong")
      }
    })
  }

  async function handleDuplicate() {
    setError(null)
    setDuplicating(true)
    try {
      const result = await duplicatePractice(practiceId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(practiceEditPath(result.slug ?? result.id))
    } catch {
      setError("Something went wrong")
    } finally {
      setDuplicating(false)
    }
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await deletePractice(practiceId)
        if (!result.ok) {
          if (result.lock) onLockChange(result.lock)
          setError(result.error)
          return
        }
        router.push("/practices")
      } catch {
        setError("Something went wrong")
      }
    })
  }

  return (
    <>
      <div className="flex shrink-0 items-start">
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
            onClick={() => {
              setError(null)
              setConfirmUnpublish(true)
            }}
            disabled={busy || lockedElsewhere}
            aria-label="Unpublish practice"
            className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors disabled:opacity-40"
          >
            <UnpublishIcon className="h-5 w-5" />
            <HoverDetail label="Unpublish" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setConfirmPublish(true)
            }}
            disabled={busy || lockedElsewhere}
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
          disabled={busy}
          aria-label="Edit practice"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors disabled:opacity-40"
        >
          <ActionIcon kind="edit" className="h-5 w-5" />
          <HoverDetail label="Edit" />
        </button>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={busy}
          aria-label="Duplicate practice"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors disabled:opacity-40"
        >
          <DuplicateIcon className="h-5 w-5" />
          <HoverDetail label="Duplicate" />
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setConfirmDelete(true)
          }}
          disabled={busy || lockedElsewhere}
          aria-label="Move to Trash"
          className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-error-border text-error rounded-lg bg-background hover:bg-error-bg transition-colors disabled:opacity-40"
        >
          <ActionIcon kind="delete" className="h-5 w-5" />
          <HoverDetail label="Move to Trash" />
        </button>
      </div>

      {error && !confirmDelete && !confirmPublish && !confirmUnpublish && (
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
        closeDisabled={busy}
        title="Move to Trash"
        description={
          <>
            Move <span className="font-medium text-foreground">{title}</span> to Trash.
          </>
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={busy}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Moving…" : "Move to Trash"}
            </button>
          </ModalFooter>
        }
      >
        {error && <p className="text-sm text-red-500">{error}</p>}
      </Modal>
      <Modal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        closeDisabled={busy}
        title={`Publish ${title}?`}
        description="This will make it visible to all athletes."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmPublish(false)}
              disabled={busy}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => togglePublished(true)}
              disabled={busy}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          </ModalFooter>
        }
      >
        {error && <p className="text-sm text-red-500">{error}</p>}
      </Modal>
      <Modal
        open={confirmUnpublish}
        onClose={() => setConfirmUnpublish(false)}
        closeDisabled={busy}
        title={`Revert ${title} to draft?`}
        description="This will hide it from athletes until it's published again."
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmUnpublish(false)}
              disabled={busy}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:border border-border-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => togglePublished(false)}
              disabled={busy}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? "Reverting…" : "Revert to Draft"}
            </button>
          </ModalFooter>
        }
      >
        {error && <p className="text-sm text-red-500">{error}</p>}
      </Modal>
    </>
  )
}
