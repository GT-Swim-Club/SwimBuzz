"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RelativeDateTime } from "@/components/ui/RelativeDate"
import { FormattedText, isHtmlEmpty } from "@/components/ui/FormattedText"
import PracticeActions from "./PracticeActions"
import SharePracticeButton from "./SharePracticeButton"
import PracticeExportCapture from "./PracticeExportCapture"
import CommentSection from "./CommentSection"
import { type PracticeFormState } from "../PracticeEditor"
import { practiceEditPath, practicePath } from "@/lib/slug"
import { type PracticeEditLockInfo } from "@/lib/practice/practice-edit-lock-shared"
import InfoIcon from "@/components/ui/InfoIcon"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import PracticeEditSkeleton from "./PracticeEditSkeleton"
import { groupPracticeSetsIntoRows, type StaffTitle } from "@swimbuzz/shared"

type PracticeSetView = {
  id: string
  title: string | null
  content: string
  distance: number | null
  startsNewRow?: boolean
}

type PracticeCommentView = {
  id: string
  authorName: string
  authorId: string | null
  authorImage: string | null
  authorStaffTitle: StaffTitle | null
  body: string
  parentId: string | null
  createdAt: string
  editedAt: string | null
}

export default function PracticeDetail({
  practiceId,
  practiceSlug,
  title,
  published,
  startsAt,
  endsAt,
  timeZone,
  location,
  focus,
  tags,
  sets,
  totalDistance,
  initial,
  isCoach,
  currentUserId,
  comments,
  attendedUserIds,
  initialEditLock,
}: {
  practiceId: string
  practiceSlug: string | null
  title: string
  published: boolean
  startsAt: string
  endsAt: string
  timeZone: string
  location: string
  focus: string | null
  tags: string[]
  sets: PracticeSetView[]
  totalDistance: number
  initial: PracticeFormState
  isCoach: boolean
  currentUserId: string
  comments: PracticeCommentView[]
  attendedUserIds: string[]
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

  const attendanceHref = `${practicePath(practiceSlug ?? practiceId)}/attendance`

  return (
    <>
    {openingEditor ? (
      <PracticeEditSkeleton />
    ) : (
    <main className="space-y-5">
      <div>
        <Link
          href="/practices"
          className="mb-1 inline-block text-sm font-medium text-foreground-tertiary hover:text-foreground md:hidden"
        >
          ← Practices
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-4xl font-semibold text-foreground">{title}</h1>
              {isCoach && !published && (
                <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary/20 dark:bg-primary/30 px-2 py-0.5 text-primary-active shadow-sm dark:text-primary-hover">
                  Draft
                </span>
              )}
            </div>
            <div className="mt-1 text-lg text-foreground-secondary">
              <div className="flex items-center gap-1.5">
                <InfoIcon kind="calendar" />
                <RelativeDateTime startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {location && (
                  <span className="flex items-center gap-1.5">
                    <InfoIcon kind="location" />
                    {location}
                  </span>
                )}
                {location && totalDistance > 0 && <span>·</span>}
                {totalDistance > 0 && <span>{totalDistance} yards</span>}
              </div>
            </div>
          </div>
          <div
            className={`relative mr-3 flex shrink-0 items-center gap-2 ${
              isCoach && editLock?.locked ? "mb-7" : ""
            }`}
          >
            <SharePracticeButton
              practiceId={practiceId}
              practiceSlug={practiceSlug}
              title={title}
              startsAt={startsAt}
              endsAt={endsAt}
              timeZone={timeZone}
              location={location}
              focus={focus}
              tags={tags}
              sets={sets}
              totalDistance={totalDistance}
              captureRef={exportCaptureRef}
            />
            {isCoach ? (
              <PracticeActions
                practiceId={practiceId}
                initial={initial}
                title={title}
                published={published}
                attendanceHref={attendanceHref}
                editLock={editLock}
                onEdit={() => {
                  openingEditorRef.current = true
                  setOpeningEditor(true)
                  router.push(practiceEditPath(practiceSlug ?? practiceId))
                }}
                onLockChange={setEditLock}
              />
            ) : (
              <Link
                href={attendanceHref}
                aria-label="View attendance"
                className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors"
              >
                <ActionIcon kind="attendance" className="h-5 w-5" />
                <HoverDetail label="Attendance" />
              </Link>
            )}
            {isCoach && editLock?.locked && (
              <p
                role="status"
                className="absolute inset-x-0 top-full mt-1.5 flex items-center justify-end gap-1.5 text-right text-[11px] font-medium text-amber-800 dark:text-amber-200"
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-300" />
                {editLock.lockedByMe
                  ? "You're editing in another window."
                  : `${editLock.lockedBy?.name?.trim() || "Another coach"} is editing.`}
              </p>
            )}
          </div>
        </div>
      </div>
      {(focus && !isHtmlEmpty(focus) || tags.length > 0) && (
        <div className="rounded-2xl border-l-[3px] border-l-primary bg-background px-5 py-4 text-foreground">
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
      <section className="rounded-2xl border border-border-secondary bg-background px-6 py-5 shadow-sm">
        <div>
          {groupPracticeSetsIntoRows(sets).map((row) => (
            <div
              key={row[0].id}
              className={
                "first:pt-0 last:pb-0 py-2 " + (row.length > 1 ? "grid gap-10" : "")
              }
              style={
                row.length > 1
                  ? { gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }
                  : undefined
              }
            >
              {row.map((set) => (
                <section key={set.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-bold text-primary-active dark:text-primary-hover">
                        {set.title || "Set"}
                      </h3>
                    </div>
                    {set.distance != null && (
                      <span className="shrink-0 text-xs font-medium tabular-nums text-primary-active dark:text-primary-hover">
                        {set.distance}
                      </span>
                    )}
                  </div>
                  {!isHtmlEmpty(set.content) && (
                    <div className="mt-1">
                      <FormattedText text={set.content} />
                    </div>
                  )}
                </section>
              ))}
            </div>
          ))}
        </div>
      </section>
      <CommentSection
        practiceId={practiceId}
        currentUserId={currentUserId}
        isCoach={isCoach}
        initialComments={comments}
        attendedUserIds={attendedUserIds}
      />
    </main>
    )}
    <div
      aria-hidden
      className="pointer-events-none absolute left-[-10000px] top-0 w-[1600px]"
    >
      <div ref={exportCaptureRef} className="w-fit">
        <PracticeExportCapture
          title={title}
          showDraft={isCoach && !published}
          startsAt={startsAt}
          endsAt={endsAt}
          timeZone={timeZone}
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
