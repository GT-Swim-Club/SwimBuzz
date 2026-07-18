"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatSwimDate } from "@/lib/utils"
import { FormattedText } from "@/components/FormattedText"
import PracticeActions from "./PracticeActions"
import CommentSection from "./CommentSection"
import PracticeEditor, { type PracticeFormState } from "../PracticeEditor"
import { type PracticeEditLockInfo } from "@/lib/practice-edit-lock-shared"
import { broadcastPracticeEditLockChanged } from "@/lib/practice-edit-lock-client"
import Modal, { ModalFooter } from "@/components/Modal"

type PracticeSetView = {
  id: string
  title: string | null
  content: string
  notes: string | null
  tags: string[]
  distance: number | null
}

type PracticeCommentView = {
  id: string
  authorName: string
  authorId: string | null
  body: string
  parentId: string | null
  createdAt: string
}

export default function PracticeDetail({
  practiceId,
  title,
  published,
  dateIso,
  focus,
  sets,
  totalDistance,
  initial,
  backHref,
  isCoach,
  currentUserId,
  comments,
  initialEditLock,
}: {
  practiceId: string
  title: string
  published: boolean
  dateIso: string | null
  focus: string | null
  sets: PracticeSetView[]
  totalDistance: number
  initial: PracticeFormState
  backHref: string
  isCoach: boolean
  currentUserId: string
  comments: PracticeCommentView[]
  initialEditLock: PracticeEditLockInfo
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [editLock, setEditLock] = useState(initialEditLock)
  const [editLockToken, setEditLockToken] = useState<string | null>(null)
  const [takeoverMessage, setTakeoverMessage] = useState<string | null>(null)

  useEffect(() => {
    setEditLock(initialEditLock)
  }, [initialEditLock])

  // Long-poll lock status while viewing (not editing) for near-instant updates.
  useEffect(() => {
    if (!isCoach || editing) return

    let cancelled = false
    let requestAc: AbortController | null = null
    let expiryTimer: ReturnType<typeof setTimeout> | null = null
    let lockChannel: BroadcastChannel | null = null

    function clearExpiryTimer() {
      if (expiryTimer) {
        clearTimeout(expiryTimer)
        expiryTimer = null
      }
    }

    function abortRequest() {
      requestAc?.abort()
      requestAc = null
    }

    function scheduleExpiryRefresh(expiresAt: string | null) {
      clearExpiryTimer()
      if (!expiresAt) return
      const ms = new Date(expiresAt).getTime() - Date.now() + 100
      if (ms <= 0) {
        abortRequest()
        return
      }
      expiryTimer = setTimeout(abortRequest, ms)
    }

    async function watchLock(rev?: string) {
      while (!cancelled) {
        requestAc = new AbortController()
        try {
          const qs = rev ? `?watch=1&rev=${encodeURIComponent(rev)}` : ""
          const res = await fetch(`/api/practices/${practiceId}/lock${qs}`, {
            signal: requestAc.signal,
          })
          requestAc = null
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 2000))
            continue
          }
          const data = (await res.json()) as PracticeEditLockInfo
          setEditLock(data)
          scheduleExpiryRefresh(data.expiresAt)
          rev = data.rev
        } catch {
          requestAc = null
          if (cancelled) return
        }
      }
    }

    void watchLock()

    if (typeof BroadcastChannel !== "undefined") {
      lockChannel = new BroadcastChannel(`swimbuzz-practice-lock:${practiceId}`)
      lockChannel.onmessage = () => abortRequest()
    }

    function onVisible() {
      if (document.visibilityState === "visible") abortRequest()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      clearExpiryTimer()
      abortRequest()
      lockChannel?.close()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [isCoach, editing, practiceId])

  function handleEditDone(nextLock?: PracticeEditLockInfo | null) {
    setEditing(false)
    setEditLockToken(null)
    if (nextLock) {
      setEditLock(nextLock)
    } else {
      setEditLock({
        locked: false,
        lockedByMe: false,
        lockedBy: null,
        expiresAt: null,
        token: null,
      })
    }
    router.refresh()
  }

  function handleLockLost(message: string, lock?: PracticeEditLockInfo | null) {
    handleEditDone(lock ?? null)
    setTakeoverMessage(message)
  }

  async function handleCancelEditing() {
    try {
      await fetch(`/api/practices/${practiceId}/lock`, {
        method: "DELETE",
        keepalive: true,
        headers: editLockToken
          ? { "x-practice-edit-lock-token": editLockToken }
          : undefined,
      })
      broadcastPracticeEditLockChanged(practiceId)
    } catch {
      // lock expires on its own
    }
    handleEditDone()
  }

  const takeoverModal = (
    <Modal
      open={takeoverMessage != null}
      onClose={() => setTakeoverMessage(null)}
      title="Editing taken over"
      maxWidth="sm"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={() => setTakeoverMessage(null)}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            OK
          </button>
        </ModalFooter>
      }
    >
      <p className="text-sm text-gray-600 dark:text-zinc-300">{takeoverMessage}</p>
    </Modal>
  )

  if (editing && editLockToken) {
    return (
      <>
        <main className="mx-auto max-w-3xl space-y-6">
          <div>
            <button
              type="button"
              onClick={handleCancelEditing}
              className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
            >
              ← Cancel editing
            </button>
            <h1 className="mt-1 text-xl font-medium sm:text-2xl">Edit practice</h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
              Others can view but not edit until you save or cancel.
            </p>
          </div>
          <PracticeEditor
            key={`${practiceId}-${editLockToken}`}
            practiceId={practiceId}
            initial={initial}
            holdEditLock
            editLockToken={editLockToken}
            onCancel={() => handleEditDone()}
            onLockLost={handleLockLost}
          />
        </main>
        {takeoverModal}
      </>
    )
  }

  return (
    <>
    <main className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <Link
            href={backHref}
            className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
          >
            ← All practices
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-medium sm:text-2xl">{title}</h1>
            {isCoach && !published && (
              <span className="text-[10px] uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 dark:bg-amber-950 dark:text-amber-300">
                Draft
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {dateIso ? formatSwimDate(dateIso) : "No date"}
            {" · "}
            {sets.length} set{sets.length === 1 ? "" : "s"}
            {totalDistance > 0 ? ` · ${totalDistance.toLocaleString()} total` : ""}
          </p>
        </div>
        {isCoach && (
          <PracticeActions
            practiceId={practiceId}
            initial={initial}
            title={title}
            published={published}
            editLock={editLock}
            onEdit={(token) => {
              setEditLockToken(token)
              setEditing(true)
            }}
            onLockChange={setEditLock}
          />
        )}
      </div>

      {focus && (
        <div className="text-sm text-gray-600 dark:text-zinc-300 rounded-xl border border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40 px-4 py-3">
          <FormattedText text={focus} className="text-gray-600 dark:text-zinc-300" />
        </div>
      )}

      <div className="space-y-5">
        {sets.map((set) => (
          <section
            key={set.id}
            className="rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
                <h2 className="font-medium text-gray-900 dark:text-zinc-100">
                  {set.title || "Set"}
                </h2>
                {set.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/practices?tag=${encodeURIComponent(t)}`}
                    className="text-[10px] uppercase tracking-wide rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    {t}
                  </Link>
                ))}
              </div>
              {set.distance != null && (
                <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">
                  {set.distance.toLocaleString()}
                </span>
              )}
            </div>

            <div className="mt-3">
              <FormattedText text={set.content} />
            </div>

            {set.notes && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-3 py-2">
                <FormattedText
                  text={set.notes}
                  className="text-amber-900 dark:text-amber-200"
                />
              </div>
            )}
          </section>
        ))}
      </div>

      <CommentSection
        practiceId={practiceId}
        currentUserId={currentUserId}
        isCoach={isCoach}
        initialComments={comments}
      />
    </main>

    {takeoverModal}
    </>
  )
}
