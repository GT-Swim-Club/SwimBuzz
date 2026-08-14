"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import PracticeEditor, { type PracticeFormState } from "../../PracticeEditor"
import PracticeViewSkeleton from "../PracticeViewSkeleton"
import PracticeEditSkeleton from "../PracticeEditSkeleton"
import {
  broadcastPracticeEditLockChanged,
  broadcastPracticeEditLockYield,
  storePracticeEditLockHandoff,
  takePracticeEditLockHandoff,
} from "@/lib/practice-edit-lock-client"
import { practicePath } from "@/lib/slug"
import type { PracticeEditLockInfo } from "@/lib/practice-edit-lock-shared"

type EditState = "acquiring" | "editing" | "blocked" | "lost"

export default function PracticeEditClient({
  practiceId,
  practiceSlug,
  title,
  initial,
  availableTags,
}: {
  practiceId: string
  practiceSlug: string
  title: string
  initial: PracticeFormState
  availableTags: string[]
}) {
  const router = useRouter()
  const [state, setState] = useState<EditState>("acquiring")
  const [lockToken, setLockToken] = useState<string | null>(null)
  const [lock, setLock] = useState<PracticeEditLockInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lostMessage, setLostMessage] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [takingOver, setTakingOver] = useState(false)
  const targetSlugRef = useRef(practiceSlug)

  function returnToPractice(nextSlug?: string | null) {
    setLeaving(true)
    router.replace(practicePath(nextSlug ?? targetSlugRef.current))
  }

  async function acquireLock(force = false) {
    let handoffStarted = false
    if (force) setTakingOver(true)
    else setState("acquiring")
    setError(null)
    if (force) broadcastPracticeEditLockYield(practiceId)
    try {
      const res = await fetch(`/api/practices/${practiceId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      })
      const data = (await res.json().catch(() => ({}))) as PracticeEditLockInfo & {
        error?: string
        token?: string
        lock?: PracticeEditLockInfo
      }
      if (!res.ok) {
        setLock(data.lock ?? null)
        if (res.status === 409 && data.lock) {
          // The modal already explains the active lock; do not repeat it as an error.
          setState("blocked")
          return
        }
        setError(data.error ?? "Could not start editing")
        setState("blocked")
        return
      }
      if (!data.token) {
        setError("Could not start editing")
        setState("blocked")
        return
      }
      if (force) {
        storePracticeEditLockHandoff(practiceId, data)
        handoffStarted = true
        window.location.reload()
        return
      }
      setLock(data)
      setLockToken(data.token)
      setState("editing")
      broadcastPracticeEditLockChanged(practiceId)
    } catch {
      setError("Something went wrong")
      setState("blocked")
    } finally {
      if (!handoffStarted) setTakingOver(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const handoffLock = takePracticeEditLockHandoff(practiceId)
      if (handoffLock?.token) {
        setLock(handoffLock)
        setLockToken(handoffLock.token)
        setState("editing")
        broadcastPracticeEditLockChanged(practiceId)
        return
      }
      void acquireLock()
    }, 0)
    return () => window.clearTimeout(timer)
    // Acquire once when this dedicated editor route opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const lockedByOtherUser = Boolean(lock?.locked && !lock.lockedByMe)
  const lockerName = lock?.lockedBy?.name?.trim() || "Another coach"

  if (leaving) {
    return (
      <main className="mx-auto max-w-4xl">
        <PracticeViewSkeleton />
      </main>
    )
  }

  return (
    <>
      {state === "acquiring" && <PracticeEditSkeleton />}
      {state === "editing" && lockToken && (
        <main className="mx-auto max-w-4xl">
          <PracticeEditor
            key={`${practiceId}-${lockToken}`}
            practiceId={practiceId}
            practiceSlug={practiceSlug}
            initial={initial}
            holdEditLock
            editLockToken={lockToken}
            onCancel={(nextSlug) => returnToPractice(nextSlug)}
            onLockLost={(message, _nextLock, nextSlug) => {
              if (nextSlug) targetSlugRef.current = nextSlug
              setLockToken(null)
              setLostMessage(message)
              setState("lost")
            }}
            availableTags={availableTags}
          />
        </main>
      )}
      <Modal
        open={state === "blocked"}
        onClose={() => returnToPractice()}
        closeDisabled={state === "acquiring" || takingOver}
        title="Practice is being edited"
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => returnToPractice()}
              disabled={takingOver}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void acquireLock(true)}
              disabled={takingOver}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {takingOver ? "Saving changes…" : "Take over"}
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-foreground-secondary dark:text-foreground-secondary">
          {lockedByOtherUser ? (
            <>
              <span className="font-medium text-foreground">{lockerName}</span> is currently editing
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
        open={state === "lost"}
        onClose={() => returnToPractice()}
        title={lostMessage?.includes("session expired") ? "Session expired" : "Editing taken over"}
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => returnToPractice()}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover"
            >
              Return to practice
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-foreground-secondary">{lostMessage}</p>
      </Modal>
    </>
  )
}
