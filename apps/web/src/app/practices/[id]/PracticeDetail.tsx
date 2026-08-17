"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatSwimDate } from "@/lib/utils"
import { formatClockTimeRange } from "@swimbuzz/shared"
import { FormattedText, isHtmlEmpty } from "@/components/FormattedText"
import PracticeActions from "./PracticeActions"
import ExportPracticePdfButton from "./ExportPracticePdfButton"
import PracticeExportCapture from "./PracticeExportCapture"
import CommentSection from "./CommentSection"
import { type PracticeFormState } from "../PracticeEditor"
import { practiceEditPath } from "@/lib/slug"
import { type PracticeEditLockInfo } from "@/lib/practice-edit-lock-shared"
import InfoIcon from "@/components/InfoIcon"
import PracticeEditSkeleton from "./PracticeEditSkeleton"

type PracticeSetView = {
  id: string
  title: string | null
  content: string
  distance: number | null
}

type PracticeCommentView = {
  id: string
  authorName: string
  authorId: string | null
  authorImage: string | null
  body: string
  parentId: string | null
  createdAt: string
}

export default function PracticeDetail({
  practiceId,
  practiceSlug,
  title,
  published,
  dateIso,
  startTime,
  endTime,
  location,
  focus,
  tags,
  sets,
  totalDistance,
  initial,
  isCoach,
  currentUserId,
  comments,
  initialEditLock,
}: {
  practiceId: string
  practiceSlug: string | null
  title: string
  published: boolean
  dateIso: string | null
  startTime: string
  endTime: string
  location: string
  focus: string | null
  tags: string[]
  sets: PracticeSetView[]
  totalDistance: number
  initial: PracticeFormState
  isCoach: boolean
  currentUserId: string
  comments: PracticeCommentView[]
  initialEditLock: PracticeEditLockInfo
}) {
  const router = useRouter()
  const exportCaptureRef = useRef<HTMLDivElement>(null)
  const [openingEditor, setOpeningEditor] = useState(false)
  const openingEditorRef = useRef(false)
  const [editLock, setEditLock] = useState(() =>
    initialEditLock.lockedByMe
      ? {
          ...initialEditLock,
          locked: false,
          lockedByMe: false,
          lockedBy: null,
          expiresAt: null,
          rev: "unlocked",
        }
      : initialEditLock
  )

  // Long-poll lock status while viewing (not editing) for near-instant updates.
  useEffect(() => {
    if (!isCoach) return

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
          if (cancelled || openingEditorRef.current) return
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
  }, [isCoach, practiceId])

  return (
    <>
    {openingEditor ? (
      <PracticeEditSkeleton />
    ) : (
    <main className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link
          href="/practices"
          className="text-sm font-medium text-foreground-tertiary hover:text-foreground"
        >
          ← Practices
        </Link>
        <div className="mt-1 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-3xl font-semibold text-foreground sm:text-4xl">{title}</h1>
              {isCoach && !published && (
                <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary/20 dark:bg-primary/30 px-2 py-0.5 text-primary-active shadow-sm dark:text-primary-hover">
                  Draft
                </span>
              )}
            </div>
            <div className="mt-1 text-base text-foreground-secondary sm:text-lg">
              <div className="flex items-center gap-1.5">
                <InfoIcon kind="calendar" />
                {dateIso ? formatSwimDate(dateIso) : "No date"}
                {startTime || endTime ? ` · ${formatClockTimeRange(startTime, endTime)}` : ""}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {location && (
                  <span className="flex items-center gap-1.5">
                    <InfoIcon kind="location" />
                    {location}
                  </span>
                )}
                {location && totalDistance > 0 && <span>·</span>}
                {totalDistance > 0 && <span>{totalDistance.toLocaleString()} yards</span>}
              </div>
            </div>
          </div>
          <div className="mr-2 flex shrink-0 items-center gap-2 sm:mr-3">
            <ExportPracticePdfButton
              practiceId={practiceId}
              title={title}
              dateIso={dateIso}
              captureRef={exportCaptureRef}
            />
            {isCoach && (
              <PracticeActions
                practiceId={practiceId}
                initial={initial}
                title={title}
                published={published}
                editLock={editLock}
                onEdit={() => {
                  openingEditorRef.current = true
                  setOpeningEditor(true)
                  router.push(practiceEditPath(practiceSlug ?? practiceId))
                }}
                onLockChange={setEditLock}
              />
            )}
          </div>
        </div>
      </div>
      {(focus && !isHtmlEmpty(focus) || tags.length > 0) && (
        <div className="rounded-2xl border-l-[3px] border-l-primary bg-background px-4 py-3 text-foreground sm:px-5 sm:py-4">
          {focus && !isHtmlEmpty(focus) && (
            <FormattedText text={focus} className="text-foreground" />
          )}
          {tags.length > 0 && (
            <div className={(focus && !isHtmlEmpty(focus)) ? "mt-3 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
              {tags.map((t) => (
                <Link
                  key={t}
                  href={`/practices?tag=${encodeURIComponent(t)}`}
                  className="rounded-full bg-primary/80 px-2 py-0.5 text-xs text-primary-text transition-opacity hover:opacity-90 dark:bg-primary"
                >
                  {t}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      <section className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="space-y-2">
          {sets.map((set) => (
            <section
              key={set.id}
              className="py-2 first:pt-0 last:pb-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-primary-active dark:text-primary-hover">
                    {set.title || "Set"}
                  </h3>
                </div>
                {set.distance != null && (
                  <span className="shrink-0 text-xs font-medium text-primary-active dark:text-primary-hover">
                    {set.distance.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <FormattedText text={set.content} />
              </div>
            </section>
          ))}
        </div>
      </section>
      <CommentSection
        practiceId={practiceId}
        currentUserId={currentUserId}
        isCoach={isCoach}
        initialComments={comments}
      />
    </main>
    )}
    <div
      aria-hidden
      className="pointer-events-none absolute left-[-10000px] top-0"
    >
      <div ref={exportCaptureRef}>
        <PracticeExportCapture
          title={title}
          showDraft={isCoach && !published}
          dateIso={dateIso}
          startTime={startTime}
          endTime={endTime}
          location={location}
          focus={focus}
          tags={tags}
          sets={sets}
          totalDistance={totalDistance}
        />
      </div>
    </div>

    </>
  )
}
