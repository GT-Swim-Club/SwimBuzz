"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import ActionIcon from "@/components/ActionIcon"
import HoverDetail from "@/components/HoverDetail"
import InfoIcon from "@/components/InfoIcon"
import { athletePath } from "@/lib/slug"
import { formatSwimDate } from "@/lib/utils"
import { ZonedClockTime, ZonedInstantTime } from "@/components/ZonedTime"
import { RelativeDate } from "@/components/RelativeDate"
import { formatClockTime } from "@swimbuzz/shared"

type AttendanceRecord = {
  id: string
  athleteId: string
  athleteSlug: string | null
  name: string
  gender: "M" | "F"
  year: string | null
  method: "SCAN" | "MANUAL"
  recordedAt: string
}

type RosterEntry = {
  id: string
  slug: string | null
  name: string
  nicknames: string[]
  gender: "M" | "F"
  year: string | null
}

type Feedback =
  | { kind: "added"; name: string; via: "SCAN" | "MANUAL" }
  | { kind: "duplicate"; name: string }
  | { kind: "error"; message: string }

const FEEDBACK_MS = 4000
const REMOVE_ANIMATION_MS = 180
/** Long enough to outlast the row's entrance + flash animation. */
const NEW_ROW_MS = 2000

function checkInTime(iso: string) {
  return formatClockTime(new Date(iso))
}

export default function AttendanceManager({
  practiceId,
  title,
  dateIso,
  startTime,
  endTime,
  timeZone,
  location,
  initialAttendance,
  roster,
}: {
  practiceId: string
  title: string
  dateIso: string | null
  startTime: string
  endTime: string
  timeZone: string
  location: string
  initialAttendance: AttendanceRecord[]
  roster: RosterEntry[]
}) {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initialAttendance)
  // Only the rows present on load stagger their entrance; scans slide in at once.
  const [initialIds] = useState(() => new Set(initialAttendance.map((record) => record.id)))
  const [recording, setRecording] = useState(false)
  const [scanValue, setScanValue] = useState("")
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [pending, setPending] = useState(false)
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set())
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const scanInputRef = useRef<HTMLInputElement>(null)
  // Scans arrive faster than a round trip; chain them so none are dropped.
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const attendedIds = useMemo(
    () => new Set(attendance.map((record) => record.athleteId)),
    [attendance]
  )

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return roster
      .filter((entry) => !attendedIds.has(entry.id))
      .filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) ||
          entry.nicknames.some((nickname) => nickname.toLowerCase().includes(needle))
      )
      .slice(0, 6)
  }, [query, roster, attendedIds])

  const showFeedback = useCallback((next: Feedback) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback(next)
    feedbackTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    }
  }, [])

  const markNew = useCallback((id: string) => {
    setNewIds((current) => new Set(current).add(id))
    setTimeout(() => {
      setNewIds((current) => {
        if (!current.has(id)) return current
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, NEW_ROW_MS)
  }, [])

  const checkIn = useCallback(
    (payload: { gtid: string } | { athleteId: string }, optimistic?: AttendanceRecord) => {
      // Manual check-in already knows the athlete's identity, so show their
      // card immediately instead of waiting on the round trip — matching how
      // removal feels instant. A scan can't do this: the identity is only
      // known once the server resolves the GTID.
      if (optimistic) {
        setAttendance((current) => [optimistic, ...current])
        markNew(optimistic.id)
      }
      const tempId = optimistic?.id
      queueRef.current = queueRef.current.then(async () => {
        setPending(true)
        try {
          const res = await fetch(`/api/practices/${practiceId}/attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
          const data = (await res.json().catch(() => ({}))) as {
            error?: string
            duplicate?: boolean
            record?: AttendanceRecord
          }
          if (!res.ok) {
            if (tempId) setAttendance((current) => current.filter((r) => r.id !== tempId))
            showFeedback({ kind: "error", message: data.error ?? "Could not check that athlete in." })
            return
          }
          if (!data.record) return
          const record = data.record
          if (data.duplicate) {
            setAttendance((current) => {
              const withoutTemp = tempId ? current.filter((r) => r.id !== tempId) : current
              return withoutTemp.some((r) => r.athleteId === record.athleteId)
                ? withoutTemp
                : [record, ...withoutTemp]
            })
            showFeedback({ kind: "duplicate", name: record.name })
            return
          }
          setAttendance((current) => {
            const withoutTemp = tempId ? current.filter((r) => r.id !== tempId) : current
            return [record, ...withoutTemp.filter((r) => r.id !== record.id)]
          })
          markNew(record.id)
          showFeedback({ kind: "added", name: record.name, via: record.method })
        } catch {
          if (tempId) setAttendance((current) => current.filter((r) => r.id !== tempId))
          showFeedback({ kind: "error", message: "Something went wrong. Try that scan again." })
        } finally {
          setPending(false)
        }
      })
      return queueRef.current
    },
    [practiceId, showFeedback, markNew]
  )

  async function removeAttendee(record: AttendanceRecord, index: number) {
    // Let the row animate out before it leaves the list.
    setRemovingId(record.id)
    await new Promise((resolve) => setTimeout(resolve, REMOVE_ANIMATION_MS))
    setAttendance((current) => current.filter((r) => r.id !== record.id))
    setRemovingId(null)
    const res = await fetch(
      `/api/practices/${practiceId}/attendance?athleteId=${encodeURIComponent(record.athleteId)}`,
      { method: "DELETE" }
    )
    if (!res.ok) {
      setAttendance((current) => {
        if (current.some((r) => r.id === record.id)) return current
        const restored = [...current]
        restored.splice(Math.min(index, restored.length), 0, record)
        return restored
      })
      showFeedback({ kind: "error", message: `Could not remove ${record.name}.` })
    }
  }

  function handleScanSubmit(event: React.FormEvent) {
    event.preventDefault()
    const value = scanValue.trim()
    setScanValue("")
    if (!value) return
    void checkIn({ gtid: value })
  }

  function startRecording() {
    setRecording(true)
    setFeedback(null)
    setScanValue("")
  }

  function stopRecording() {
    setRecording(false)
    setScanValue("")
  }

  // Keep the reader's keystrokes landing in the scan field for as long as
  // recording is on, even if the coach clicks elsewhere on the page.
  useEffect(() => {
    if (!recording) return
    scanInputRef.current?.focus()

    function refocus(event: Event) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest("button, a"))
      ) {
        return
      }
      scanInputRef.current?.focus()
    }

    document.addEventListener("pointerup", refocus)
    return () => document.removeEventListener("pointerup", refocus)
  }, [recording])

  const scannedCount = attendance.filter((r) => r.method === "SCAN").length

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Attendance
        </p>
        <div className="mt-2 text-base text-foreground-secondary sm:text-lg">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5">
              <InfoIcon kind="calendar" />
              {dateIso ? <RelativeDate day={dateIso} absolute={formatSwimDate(dateIso)} /> : "No date"}
              {startTime || endTime ? (
                <>
                  {" · "}
                  <ZonedClockTime
                    date={dateIso ? dateIso.slice(0, 10) : null}
                    startTime={startTime}
                    endTime={endTime}
                    sourceTimeZone={timeZone}
                  />
                </>
              ) : null}
            </span>
            {location && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1.5">
                  <InfoIcon kind="location" />
                  {location}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <section
        className={
          "mt-5 rounded-2xl border bg-background px-5 py-4 shadow-sm transition-colors sm:px-6 sm:py-5 " +
          (recording ? "border-primary/60" : "border-border")
        }
      >
        {recording ? (
          <form onSubmit={handleScanSubmit}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                  <span
                    aria-hidden
                    className="attendance-scan-pulse absolute inline-flex h-3 w-3 rounded-full bg-primary"
                  />
                  <span aria-hidden className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <div>
                  <p className="text-base font-medium text-foreground">Recording attendance</p>
                  <p className="text-sm text-foreground-tertiary">
                    Scan a Buzzcard, or type a GTID and press Enter.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-fill"
              >
                Stop recording
              </button>
            </div>

            <label className="relative mt-4 block">
              <span className="sr-only">Buzzcard scan or GTID</span>
              <input
                ref={scanInputRef}
                value={scanValue}
                onChange={(event) => setScanValue(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                placeholder="Waiting for a Buzzcard scan…"
                aria-label="Buzzcard scan or GTID"
                className="w-full rounded-xl border border-border bg-fill-secondary px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-foreground placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-foreground-tertiary"
              />
              {pending && (
                <span
                  aria-hidden
                  className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-t-transparent"
                />
              )}
            </label>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-medium text-foreground">Buzzcard check-in</p>
              <p className="text-sm text-foreground-tertiary">
                Start recording, then scan each athlete&apos;s Buzzcard as they arrive.
              </p>
            </div>
            <button
              type="button"
              onClick={startRecording}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text transition-colors hover:bg-primary-hover"
            >
              <ActionIcon kind="scan" className="h-4 w-4" />
              Start recording
            </button>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={
              "attendance-feedback-in mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm " +
              (feedback.kind === "added"
                ? "border-primary/30 bg-primary/10 text-primary-active dark:text-primary-hover"
                : feedback.kind === "duplicate"
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:border-amber-300/20 dark:text-amber-200"
                  : "border-red-200 bg-red-50 text-error dark:border-red-900/50 dark:bg-red-950/30")
            }
          >
            {feedback.kind === "added" ? (
              <>
                <ActionIcon kind="check" className="h-4 w-4" />
                <span>
                  <span className="font-medium">{feedback.name}</span> checked in
                  {feedback.via === "MANUAL" ? " by name" : ""}.
                </span>
              </>
            ) : feedback.kind === "duplicate" ? (
              <span>
                <span className="font-medium">{feedback.name}</span> is already checked in.
              </span>
            ) : (
              <span>{feedback.message}</span>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-medium uppercase tracking-wide text-foreground-secondary">
            Checked in ({attendance.length})
          </h2>
          {scannedCount > 0 && (
            <p className="text-xs text-foreground-tertiary">
              {scannedCount} scanned · {attendance.length - scannedCount} added by name
            </p>
          )}
        </div>

        <div className="relative mt-3">
          <label className="block">
            <span className="sr-only">Check in an athlete by name</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Check in by name…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          {matches.length > 0 && (
            <ul className="attendance-feedback-in absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-background-elevated shadow-md">
              {matches.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("")
                      void checkIn(
                        { athleteId: entry.id },
                        {
                          id: `pending-${entry.id}-${Date.now()}`,
                          athleteId: entry.id,
                          athleteSlug: entry.slug,
                          name: entry.name,
                          gender: entry.gender,
                          year: entry.year,
                          method: "MANUAL",
                          recordedAt: new Date().toISOString(),
                        }
                      )
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-fill-secondary"
                  >
                    <span className="truncate">{entry.name}</span>
                    <ActionIcon kind="check" className="h-4 w-4 shrink-0 text-foreground-tertiary" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {attendance.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-foreground-secondary">
            No one has checked in yet.
            {!recording && " Start recording to scan Buzzcards."}
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {attendance.map((record, index) => (
              <li
                key={record.id}
                className={
                  "attendance-row-in relative flex items-center gap-3 overflow-hidden rounded-xl border border-border px-3 py-2.5 " +
                  (removingId === record.id ? "attendance-row-out" : "")
                }
                style={
                  removingId === record.id
                    ? { animationDelay: "0ms" }
                    : initialIds.has(record.id)
                      ? { animationDelay: `${Math.min(index * 35, 420)}ms` }
                      : undefined
                }
              >
                {newIds.has(record.id) && (
                  <span
                    aria-hidden
                    className="attendance-row-flash pointer-events-none absolute inset-0 rounded-xl"
                  />
                )}
                <span className="relative w-6 shrink-0 text-right font-mono text-xs text-foreground-tertiary">
                  {attendance.length - index}
                </span>
                <div className="relative min-w-0 flex-1">
                  {record.athleteSlug ? (
                    <Link
                      href={athletePath(record.athleteSlug)}
                      className="truncate font-medium text-foreground transition-colors hover:text-primary"
                    >
                      {record.name}
                    </Link>
                  ) : (
                    <span className="truncate font-medium text-foreground">{record.name}</span>
                  )}
                  <p className="text-xs text-foreground-tertiary">
                    {/* Check-in times render in the viewer's timezone. */}
                    <ZonedInstantTime at={record.recordedAt}>
                      <span suppressHydrationWarning>{checkInTime(record.recordedAt)}</span>
                    </ZonedInstantTime>
                    {record.method === "MANUAL" ? " · added by name" : " · Buzzcard"}
                    {record.year ? ` · ${record.year}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeAttendee(record, index)}
                  disabled={removingId === record.id}
                  aria-label={`Remove ${record.name} from attendance`}
                  className="group relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-tertiary transition-colors hover:bg-red-50 hover:text-error disabled:opacity-40 dark:hover:bg-red-950/40"
                >
                  <ActionIcon kind="close" className="h-4 w-4" />
                  <HoverDetail label="Remove" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pending && <span className="sr-only">Saving check-in…</span>}
      </section>
    </>
  )
}
