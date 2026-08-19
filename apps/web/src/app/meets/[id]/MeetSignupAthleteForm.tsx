"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { MeetFormCustomQuestionFields } from "@/components/MeetFormCustomQuestions"
import type { MeetSignupEventOption, MeetSignupQuestion } from "@/lib/meet-signup"
import {
  formatSignupEventLabel,
  isValidSignupEntryTime,
  normalizeSignupEntryTime,
  partitionSignupEvents,
  sortSignupEventsByOrder,
} from "@/lib/meet-signup"
import { formatDisplayTime } from "@/lib/utils"
import { RelativeInstantTime } from "@/components/RelativeDate"

export type MeetSignupAthleteInitial = {
  events: string[]
  entryTimes: Record<string, string>
  notes: string
  answers: Record<string, string>
}

type AthleteOption = { id: string; name: string; gender: "M" | "F" }

export default function MeetSignupAthleteForm({
  meetId,
  course,
  eventOptions,
  minEvents,
  maxEvents,
  maxRelayEvents,
  askNotes,
  instructions,
  customQuestions,
  windowOpen,
  windowReason,
  canWithdraw,
  withdrawReason,
  withdrawDeadline,
  formOpenAt,
  formCloseAt,
  formWithdrawUntil,
  isCoach,
  isStaff = false,
  selfAthleteId,
  athletes,
  entriesByAthleteId,
  openRequest = null,
  onOpenRequestHandled,
  pageMode = false,
}: {
  meetId: string
  course: string
  eventOptions: MeetSignupEventOption[]
  minEvents: number | null
  maxEvents: number | null
  maxRelayEvents: number | null
  askNotes: boolean
  instructions: string
  customQuestions: MeetSignupQuestion[]
  windowOpen: boolean
  windowReason: string | null
  canWithdraw: boolean
  withdrawReason: string | null
  withdrawDeadline: string | null
  formOpenAt: string | null
  formCloseAt: string | null
  formWithdrawUntil: string | null
  isCoach: boolean
  /** Real staff role — send athleteId on API even during athlete preview. */
  isStaff?: boolean
  selfAthleteId: string | null
  athletes: AthleteOption[]
  entriesByAthleteId: Record<string, MeetSignupAthleteInitial>
  openRequest?: { type: "edit"; athleteId: string } | { type: "add" } | null
  onOpenRequestHandled?: () => void
  /** Render this sign-up in the dedicated route instead of behind a trigger modal. */
  pageMode?: boolean
}) {
  const router = useRouter()
  const defaultAthleteId = selfAthleteId ?? athletes[0]?.id ?? ""
  const [open, setOpen] = useState(pageMode)
  const [athleteId, setAthleteId] = useState(defaultAthleteId)
  const [events, setEvents] = useState<string[]>([])
  const [entryTimes, setEntryTimes] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [importingBests, setImportingBests] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const canEdit = !isStaff && (isCoach || windowOpen)
  const initial = athleteId ? entriesByAthleteId[athleteId] ?? null : null
  const selectedAthlete = athletes.find((a) => a.id === athleteId) ?? null
  const gender = selectedAthlete?.gender ?? null
  const previewOnly = isStaff && !isCoach

  useEffect(() => {
    if (!open) return
    const entry = athleteId ? entriesByAthleteId[athleteId] : null
    setEvents(entry?.events ?? [])
    setEntryTimes(entry?.entryTimes ?? {})
    setNotes(entry?.notes ?? "")
    setAnswers(entry?.answers ?? {})
    setError(null)
  }, [open, athleteId, entriesByAthleteId])

  useEffect(() => {
    if (!openRequest) return
    if (openRequest.type === "edit") {
      setAthleteId(openRequest.athleteId)
    } else {
      const next =
        athletes.find((a) => !entriesByAthleteId[a.id])?.id ?? athletes[0]?.id ?? ""
      setAthleteId(next)
    }
    setOpen(true)
    onOpenRequestHandled?.()
  }, [openRequest, onOpenRequestHandled, athletes, entriesByAthleteId])

  const { individual, relay } = partitionSignupEvents(events)
  const optionByEvent = useMemo(() => {
    const map = new Map<string, MeetSignupEventOption>()
    for (const opt of eventOptions) map.set(opt.event, opt)
    return map
  }, [eventOptions])

  const selfEntry =
    selfAthleteId && !isCoach ? entriesByAthleteId[selfAthleteId] ?? null : null

  function toggleEvent(event: string) {
    setEvents((prev) => {
      if (prev.includes(event)) {
        setEntryTimes((times) => {
          const next = { ...times }
          delete next[event]
          return next
        })
        return prev.filter((e) => e !== event)
      }
      return [...prev, event]
    })
  }

  async function fillLifetimeBests() {
    if (!athleteId || individual.length === 0 || importingBests || !canEdit) return
    setImportingBests(true)
    setImportError(null)
    setError(null)
    try {
      const params = new URLSearchParams({
        course,
        events: individual.join(","),
      })
      const res = await fetch(`/api/athletes/${athleteId}/best-times?${params}`)
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        times?: Record<string, string>
      }
      if (!res.ok) {
        setImportError(data.error || "Failed to load lifetime bests.")
        return
      }
      const times = data.times ?? {}
      if (Object.keys(times).length === 0) {
        setImportError(`No ${course} lifetime bests found for the selected events.`)
        return
      }
      setEntryTimes((prev) => {
        const next = { ...prev }
        for (const [event, time] of Object.entries(times)) {
          next[event] = time
        }
        return next
      })
    } catch {
      setImportError("Failed to load lifetime bests.")
    } finally {
      setImportingBests(false)
    }
  }

  function formatEntrySummary(entry: MeetSignupAthleteInitial, g: "M" | "F" | null) {
    return sortSignupEventsByOrder(entry.events, eventOptions)
      .map((ev) => {
        const opt = optionByEvent.get(ev)
        const label = opt ? formatSignupEventLabel(opt, g) : ev
        const time = entry.entryTimes[ev]
        return time ? `${label} (${formatDisplayTime(time)})` : label
      })
      .join(", ")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isStaff) {
      setError("Coaches cannot edit athlete sign-ups.")
      return
    }
    if (!athleteId) {
      setError(isCoach ? "Select an athlete" : "No athlete profile")
      return
    }
    const badTime = individual.find((event) => !isValidSignupEntryTime(entryTimes[event] ?? ""))
    if (badTime) {
      setError(`Invalid time for ${badTime}. Use NT, or formats like 58.32 or 1:02.45`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const normalizedTimes: Record<string, string> = {}
      for (const event of individual) {
        normalizedTimes[event] = normalizeSignupEntryTime(entryTimes[event] ?? "")
      }
      const res = await fetch(`/api/meets/${meetId}/signup/entry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events,
          entryTimes: normalizedTimes,
          notes,
          answers,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save sign-up")
        return
      }
      if (pageMode) {
        router.push(`/meets/${meetId}`)
      } else {
        setOpen(false)
        router.refresh()
      }
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleWithdraw() {
    if (!athleteId || isStaff) return
    setLoading(true)
    setWithdrawError(null)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/signup/entry`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setWithdrawError(data.error ?? "Failed to drop")
        return
      }
      setConfirmWithdrawOpen(false)
      if (pageMode) {
        router.push(`/meets/${meetId}`)
      } else {
        setOpen(false)
        router.refresh()
      }
    } catch {
      setWithdrawError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (!isCoach && !selfAthleteId) {
    return (
      <p className="text-sm text-foreground-secondary">
        Your account isn&apos;t linked to a roster athlete, so you can&apos;t sign up yet. Ask a
        coach to add you to the roster.
      </p>
    )
  }

  if (isCoach && athletes.length === 0) {
    return (
      <p className="text-sm text-foreground-secondary">
        No athletes on this meet&apos;s season roster to sign up.
      </p>
    )
  }

  const entryTimesValid = individual.every((event) =>
    isValidSignupEntryTime(entryTimes[event] ?? "")
  )

  const submitDisabled =
    loading ||
    !athleteId ||
    events.length === 0 ||
    (minEvents != null && individual.length < minEvents) ||
    !entryTimesValid

  return (
    <div className="space-y-2">
      {previewOnly && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Athlete view preview — coaches cannot edit sign-ups.
        </p>
      )}
      {!pageMode && !isCoach && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-text hover:bg-primary-hover transition-colors"
              >
                {selfEntry ? "Edit Sign-Up" : "Sign Up"}
              </button>
            ) : previewOnly && selfEntry ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="bg-background hover:bg-fill text-sm px-4 py-2 rounded-lg border border-border transition-colors"
              >
                View Sign-Up
              </button>
            ) : null}
            {!canEdit && !previewOnly && canWithdraw && selfEntry && (
              <button
                type="button"
                onClick={() => {
                  setWithdrawError(null)
                  setConfirmWithdrawOpen(true)
                }}
                disabled={loading}
                className="text-sm px-4 py-2 rounded-lg border border-border border-red-200 text-error hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
              >
                Drop
              </button>
            )}
          </div>
          {!previewOnly && !canEdit && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {windowReason === "Sign-ups are closed for this meet." ? null : windowReason}
              {!windowOpen &&
                !canWithdraw &&
                selfEntry &&
                withdrawReason &&
                withdrawReason !== windowReason && (
                <span className="block mt-1 text-foreground-secondary font-normal">
                  {withdrawReason}
                </span>
              )}
            </p>
          )}

          <div className="text-sm text-foreground-secondary flex flex-col gap-y-1 mt-2">
            {formOpenAt && new Date(formOpenAt) > new Date() && (
              <span>
                Opens:{" "}
                <RelativeInstantTime at={formOpenAt} />
              </span>
            )}
            {formCloseAt && new Date(formCloseAt) > new Date() && (
              <span>
                Closes:{" "}
                <RelativeInstantTime at={formCloseAt} />
              </span>
            )}
            {formWithdrawUntil && new Date(formWithdrawUntil) > new Date() && (
              <span>
                Drop until:{" "}
                <RelativeInstantTime at={formWithdrawUntil} />
              </span>
            )}
          </div>

          {selfEntry && selfEntry.events.length > 0 && (
            <p className="text-sm text-foreground-secondary">
              Your submission:{" "}
              {formatEntrySummary(
                selfEntry,
                athletes.find((a) => a.id === selfAthleteId)?.gender ?? null
              )}
            </p>
          )}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => {
          if (loading) return
          if (pageMode) router.push(`/meets/${meetId}`)
          else setOpen(false)
        }}
        presentation={pageMode ? "inline" : "dialog"}
        portal={!pageMode}
        panelClassName={pageMode ? "max-h-none overflow-visible shadow-sm" : ""}
        closeDisabled={loading}
        title={
          pageMode
            ? initial
              ? "Review your entry"
              : "Choose your events"
            : isCoach
              ? initial
                ? "Edit Sign-Up"
                : "Add Sign-Up"
              : selfEntry
                ? "Edit Sign-Up"
                : "Meet Sign-up"
        }
        description={instructions.trim() || undefined}
        maxWidth={pageMode ? "6xl" : "3xl"}
        busy={loading}
        onSubmit={handleSubmit}
        footer={
          <ModalFooter className="flex-wrap">
            {initial && !previewOnly && (isCoach || canWithdraw) && (
              <button
                type="button"
                onClick={() => {
                  setWithdrawError(null)
                  setConfirmWithdrawOpen(true)
                }}
                disabled={loading}
                className="bg-background w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-error hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                Drop
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (pageMode) router.push(`/meets/${meetId}`)
                else setOpen(false)
              }}
              disabled={loading}
              className="bg-background hover:bg-fill flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {pageMode ? "Back to meet" : previewOnly || (!canEdit && !isCoach) ? "Close" : "Cancel"}
            </button>
            {!previewOnly && (
              <button
                type="submit"
                disabled={submitDisabled || (!isCoach && !canEdit)}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? "Saving…" : initial ? "Update sign-up" : "Submit sign-up"}
              </button>
            )}
          </ModalFooter>
        }
      >
        {isCoach && (
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Athlete
            </label>
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            >
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {selfAthleteId === a.id ? " (you)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {!windowOpen && isCoach && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Sign-ups are closed for swimmers, but you can still edit entries as a coach.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Individual events {minEvents != null && minEvents > 0 ? <span className="text-red-500">*</span> : null}
                </p>
              {(minEvents != null || maxEvents != null) && (
                <span
                  className={
                    "text-xs " +
                    (minEvents != null && individual.length < minEvents
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-gray-400")
                  }
                >
                  {individual.length}
                  {minEvents != null && maxEvents != null
                    ? `/${minEvents}–${maxEvents}`
                    : maxEvents != null
                      ? `/${maxEvents}`
                      : ` (min ${minEvents})`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {eventOptions
                .filter((opt) => !opt.isRelay)
                .map((opt) => {
                  const active = events.includes(opt.event)
                  const atLimit =
                    !active && maxEvents != null && individual.length >= maxEvents
                  return (
                        <button
                          key={opt.event}
                          type="button"
                          disabled={loading || atLimit}
                          onClick={() => toggleEvent(opt.event)}
                          className={
                            "text-xs px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40 " +
                            (active
                              ? "bg-primary border-primary text-primary-text"
                              : "border-border text-foreground-secondary bg-background hover:bg-fill")
                          }
                        >
                      {formatSignupEventLabel(opt, gender)}
                    </button>
                  )
                })}
            </div>
          </div>

          {individual.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Entry times <span className="text-red-500">*</span>
                </p>
                <div className="flex items-center gap-2">
                  {importError && (
                    <p className="text-xs text-error">{importError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void fillLifetimeBests()}
                    disabled={loading || importingBests || !canEdit || !athleteId}
                    className="text-[11px] px-2 py-0.5 border border-border rounded-md bg-background hover:bg-fill disabled:opacity-40 transition-colors"
                  >
                    {importingBests ? "Importing…" : `Import lifetime bests`}
                  </button>
                </div>
              </div>
              {individual.map((event) => {
                const opt = optionByEvent.get(event)
                const label = opt ? formatSignupEventLabel(opt, gender) : event
                const value = entryTimes[event] ?? ""
                const invalid = value.trim().length > 0 && !isValidSignupEntryTime(value)
                return (
                  <div key={event} className="space-y-10">
                    <div className="flex items-center gap-3">
                      <label className="w-45 shrink-0 text-sm text-foreground">
                        {label}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        disabled={loading}
                        placeholder="mm:ss.ms, ss.ms, or nt"
                        value={value}
                        onChange={(e) => setEntryTimes((t) => ({ ...t, [event]: e.target.value }))}
                        onBlur={() => {
                          const trimmed = value.trim()
                          if (!trimmed) return
                          if (isValidSignupEntryTime(trimmed)) {
                            setEntryTimes((t) => ({
                              ...t,
                              [event]: normalizeSignupEntryTime(trimmed),
                            }))
                          }
                        }}
                        className={
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-mono bg-background " +
                          (invalid
                            ? "border-red-400 dark:border-red-700"
                            : "border-border")
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {eventOptions.some((opt) => opt.isRelay) && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <p className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                  Relay events
                </p>
                {maxRelayEvents != null && (
                  <span className="text-xs text-gray-400">
                    {relay.length}/{maxRelayEvents}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {eventOptions
                  .filter((opt) => opt.isRelay)
                  .map((opt) => {
                    const active = events.includes(opt.event)
                    const atLimit =
                      !active &&
                      maxRelayEvents != null &&
                      relay.length >= maxRelayEvents
                    return (
                        <button
                          key={opt.event}
                          type="button"
                          disabled={loading || atLimit}
                          onClick={() => toggleEvent(opt.event)}
                          className={
                            "text-xs px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40 " +
                            (active
                              ? "bg-primary border-primary text-primary-text"
                              : "border-border text-foreground-secondary bg-background hover:bg-fill")
                          }
                        >
                        {formatSignupEventLabel(opt, gender)}
                      </button>
                    )
                  })}
              </div>
            </div>
          )}
        </div>

        {relay.length > 0 && (
          <p className="text-sm text-foreground-secondary">
            Signing up for relays does not guarantee a spot. We will form the most competitive
            relays.
          </p>
        )}

        <MeetFormCustomQuestionFields
          questions={customQuestions}
          answers={answers}
          onChange={setAnswers}
          disabled={loading}
        />

        {askNotes && (
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={loading}
              placeholder="Comments, questions, or concerns"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            />
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>

      <Modal
        open={confirmWithdrawOpen}
        onClose={() => {
          if (loading) return
          setConfirmWithdrawOpen(false)
          setWithdrawError(null)
        }}
        closeDisabled={loading}
        busy={loading}
        title="Drop sign-up?"
        description={
          selectedAthlete
            ? `This removes ${isCoach ? `${selectedAthlete.name}'s` : "your"} meet sign-up and event selections.`
            : "This removes the meet sign-up and event selections."
        }
        maxWidth="md"
        overlayClassName="z-[60]"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setConfirmWithdrawOpen(false)
                setWithdrawError(null)
              }}
              disabled={loading}
              className="bg-background hover:bg-fill flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
                <button
                type="button"
                onClick={() => void handleWithdraw()}
                disabled={loading}
                className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-error-hover disabled:opacity-50"
              >
              {loading ? "Dropping…" : "Drop"}
            </button>
          </ModalFooter>
        }
      >
        {withdrawError ? (
          <p className="text-sm text-error">{withdrawError}</p>
        ) : null}
      </Modal>
    </div>
  )
}
