"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import type { MeetSignupEventOption, MeetSignupQuestion } from "@/lib/meet-signup"
import {
  formatSignupEventLabel,
  isValidSignupEntryTime,
  normalizeSignupEntryTime,
  partitionSignupEvents,
  sortSignupEventsByOrder,
} from "@/lib/meet-signup"
import { formatDisplayTime } from "@/lib/utils"

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
  isCoach,
  isStaff = false,
  selfAthleteId,
  athletes,
  entriesByAthleteId,
  openRequest = null,
  onOpenRequestHandled,
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
  isCoach: boolean
  /** Real staff role — send athleteId on API even during athlete preview. */
  isStaff?: boolean
  selfAthleteId: string | null
  athletes: AthleteOption[]
  entriesByAthleteId: Record<string, MeetSignupAthleteInitial>
  openRequest?: { type: "edit"; athleteId: string } | { type: "add" } | null
  onOpenRequestHandled?: () => void
}) {
  const router = useRouter()
  const defaultAthleteId = selfAthleteId ?? athletes[0]?.id ?? ""
  const [open, setOpen] = useState(false)
  const [athleteId, setAthleteId] = useState(defaultAthleteId)
  const [events, setEvents] = useState<string[]>([])
  const [entryTimes, setEntryTimes] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState("")
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [importingBests, setImportingBests] = useState(false)
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
        setError(data.error || "Failed to load lifetime bests.")
        return
      }
      const times = data.times ?? {}
      if (Object.keys(times).length === 0) {
        setError(`No ${course} lifetime bests found for the selected events.`)
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
      setError("Failed to load lifetime bests.")
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
      setOpen(false)
      router.refresh()
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
        setWithdrawError(data.error ?? "Failed to withdraw")
        return
      }
      setConfirmWithdrawOpen(false)
      setOpen(false)
      router.refresh()
    } catch {
      setWithdrawError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (!isCoach && !selfAthleteId) {
    return (
      <p className="text-sm text-gray-500 dark:text-zinc-400">
        Your account isn&apos;t linked to a roster athlete, so you can&apos;t sign up yet. Ask a
        coach to add you to the roster.
      </p>
    )
  }

  if (isCoach && athletes.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-zinc-400">
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
      {!isCoach && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {selfEntry ? "Edit Sign-Up" : "Sign Up"}
              </button>
            ) : previewOnly && selfEntry ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="text-xs px-3 py-1.5 rounded-lg border hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 transition-colors"
              >
                View Sign-Up
              </button>
            ) : !previewOnly ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {windowReason ?? "Sign-ups are closed for this meet."}
                {!windowOpen && canWithdraw && withdrawDeadline && selfEntry && (
                  <span className="block mt-1 text-gray-500 dark:text-zinc-400 font-normal">
                    You can still withdraw until{" "}
                    {new Date(withdrawDeadline).toLocaleString()}.
                  </span>
                )}
                {!windowOpen &&
                  !canWithdraw &&
                  selfEntry &&
                  withdrawReason &&
                  withdrawReason !== windowReason && (
                  <span className="block mt-1 text-gray-500 dark:text-zinc-400 font-normal">
                    {withdrawReason}
                  </span>
                )}
              </p>
            ) : null}
            {!canEdit && !previewOnly && canWithdraw && selfEntry && (
              <button
                type="button"
                onClick={() => {
                  setWithdrawError(null)
                  setConfirmWithdrawOpen(true)
                }}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
              >
                Withdraw
              </button>
            )}
          </div>

          {selfEntry && selfEntry.events.length > 0 && (
            <p className="text-sm text-gray-600 dark:text-zinc-400">
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
        onClose={() => !loading && setOpen(false)}
        closeDisabled={loading}
        title={
          isCoach
            ? initial
              ? "Edit Sign-Up"
              : "Add Sign-Up"
            : selfEntry
              ? "Edit Sign-Up"
              : "Meet Sign-up"
        }
        description={instructions.trim() || undefined}
        maxWidth="3xl"
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
                className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 dark:border-zinc-700 disabled:opacity-50"
              >
                Withdraw
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
            >
              {previewOnly || (!canEdit && !isCoach) ? "Close" : "Cancel"}
            </button>
            {!previewOnly && (
              <button
                type="submit"
                disabled={submitDisabled || (!isCoach && !canEdit)}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "Saving…" : initial ? "Update sign-up" : "Submit sign-up"}
              </button>
            )}
          </ModalFooter>
        }
      >
        {isCoach && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
              Athlete
            </label>
            <select
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
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
              <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                Individual events
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
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800")
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
                <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                  Entry times
                </p>
                <button
                  type="button"
                  onClick={() => void fillLifetimeBests()}
                  disabled={loading || importingBests || !canEdit || !athleteId}
                  className="text-[11px] px-2 py-0.5 border rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
                >
                  {importingBests ? "Importing…" : `Import lifetime bests`}
                </button>
              </div>
              {individual.map((event) => {
                const opt = optionByEvent.get(event)
                const label = opt ? formatSignupEventLabel(opt, gender) : event
                const value = entryTimes[event] ?? ""
                const invalid = value.trim().length > 0 && !isValidSignupEntryTime(value)
                return (
                  <div key={event} className="space-y-10">
                    <div className="flex items-center gap-3">
                      <label className="w-45 shrink-0 text-sm text-gray-700 dark:text-zinc-300">
                        {label}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        disabled={loading}
                        placeholder="MM:SS.MS, SS.MS, or NT"
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
                          "flex-1 rounded-lg border px-3 py-2 text-sm font-mono dark:bg-zinc-950 " +
                          (invalid
                            ? "border-red-400 dark:border-red-700"
                            : "dark:border-zinc-700")
                        }
                      />
                    </div>
                    {invalid && (
                      <p className="pl-[10.5rem] text-xs text-red-600 dark:text-red-400">
                        Use NT or a time like 58.32 / 1:02.45
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {eventOptions.some((opt) => opt.isRelay) && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
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
                            ? "bg-indigo-600 border-indigo-600 text-white"
                            : "border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800")
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
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Signing up for relays does not guarantee a spot. We will form the most competitive
            relays.
          </p>
        )}

        {customQuestions.map((q) => (
          <div key={q.id}>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
              {q.label}
              {!q.required && <span className="font-normal text-gray-400"> (optional)</span>}
            </label>
            {q.type === "choice" ? (
              <select
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                required={q.required}
                disabled={loading}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
              >
                <option value="">{q.required ? "Select…" : "—"}</option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                required={q.required}
                disabled={loading}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
              />
            )}
          </div>
        ))}

        {askNotes && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              disabled={loading}
              placeholder="Comments, questions, or concerns"
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
        title="Withdraw sign-up?"
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
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleWithdraw()}
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Withdrawing…" : "Withdraw"}
            </button>
          </ModalFooter>
        }
      >
        {withdrawError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{withdrawError}</p>
        ) : null}
      </Modal>
    </div>
  )
}
