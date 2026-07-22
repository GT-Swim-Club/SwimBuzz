"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  eventsFromEventOrder,
  formatSignupEventLabel,
  partitionSignupEvents,
  resolveSignupEventOptions,
  sortSignupEventsByOrder,
  signupWindowStatus,
  signupWithdrawStatus,
  type MeetSignupQuestion,
} from "@/lib/meet-signup"
import { isSignupAnswers } from "@/lib/meet-signup"
import { formatDisplayTime } from "@/lib/utils"
import Modal, { ModalFooter } from "@/components/Modal"
import MeetSignupConfigButton from "./MeetSignupConfigButton"
import MeetSignupAthleteForm from "./MeetSignupAthleteForm"

type EntryRow = {
  id: string
  athleteId: string
  firstName: string
  lastName: string
  gender: "M" | "F"
  events: string[]
  entryTimes: Record<string, string>
  notes: string
  answers: unknown
  updatedAt: string
}

type FormData = {
  id: string
  enabled: boolean
  instructions: string
  minEvents: number | null
  maxEvents: number | null
  maxRelayEvents: number | null
  askNotes: boolean
  customQuestions: MeetSignupQuestion[]
  openAt: string | null
  closeAt: string | null
  withdrawUntil: string | null
}

export default function MeetSignupSection({
  meetId,
  eventOrder,
  isCoach,
  isStaff = false,
  selfAthleteId,
  athletes,
  form,
  myEntry,
  entries,
  course,
  hasImportedResults = false,
}: {
  meetId: string
  eventOrder: unknown
  isCoach: boolean
  /** Real COACH/EXEC role — true even while previewing as an athlete. */
  isStaff?: boolean
  selfAthleteId: string | null
  athletes: Array<{ id: string; name: string; gender: "M" | "F" }>
  form: FormData | null
  myEntry: {
    events: string[]
    entryTimes: Record<string, string>
    notes: string
    answers: unknown
    updatedAt: string
  } | null
  entries: EntryRow[]
  course: string
  /** When true, hide "add sign-ups to roster summary". */
  hasImportedResults?: boolean
}) {
  const [responsesOpen, setResponsesOpen] = useState(false)
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false)
  const [syncingRoster, setSyncingRoster] = useState(false)
  const [withdrawEntry, setWithdrawEntry] = useState<EntryRow | null>(null)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const router = useRouter()
  const eventOptions = resolveSignupEventOptions(eventOrder)
  const optionByEvent = new Map(eventOptions.map((o) => [o.event, o]))
  const questions = form ? form.customQuestions : []
  const window = form
    ? signupWindowStatus({
        enabled: form.enabled,
        openAt: form.openAt ? new Date(form.openAt) : null,
        closeAt: form.closeAt ? new Date(form.closeAt) : null,
      })
    : { open: false, reason: "Sign-ups have not been set up yet." }
  const withdraw = form
    ? signupWithdrawStatus({
        enabled: form.enabled,
        openAt: form.openAt ? new Date(form.openAt) : null,
        closeAt: form.closeAt ? new Date(form.closeAt) : null,
        withdrawUntil: form.withdrawUntil ? new Date(form.withdrawUntil) : null,
      })
    : { allowed: false, reason: null, deadline: null }

  const showAthleteForm = !isCoach && (Boolean(form?.enabled) || Boolean(myEntry))
  const showSection = isCoach || showAthleteForm

  const entriesByAthleteId: Record<
    string,
    {
      events: string[]
      entryTimes: Record<string, string>
      notes: string
      answers: Record<string, string>
    }
  > = {}
  if (myEntry && selfAthleteId) {
    entriesByAthleteId[selfAthleteId] = {
      events: myEntry.events,
      entryTimes: myEntry.entryTimes,
      notes: myEntry.notes,
      answers: isSignupAnswers(myEntry.answers) ? myEntry.answers : {},
    }
  }

  async function syncIndividualSignupsToRoster() {
    if (hasImportedResults || syncingRoster || entries.length === 0) return

    setSyncingRoster(true)
    setSyncError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/signup/sync-entries`, {
        method: "POST",
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        synced?: number
      }
      if (!res.ok) {
        setSyncError(data.error || "Failed to sync sign-ups.")
        return
      }
      setSyncConfirmOpen(false)
      router.refresh()
    } catch {
      setSyncError("Failed to sync sign-ups.")
    } finally {
      setSyncingRoster(false)
    }
  }

  function openSyncConfirm() {
    if (
      hasImportedResults ||
      entries.length === 0 ||
      eventOptions.length === 0 ||
      syncingRoster
    ) {
      return
    }
    setSyncError(null)
    setSyncConfirmOpen(true)
  }

  async function withdrawSignup() {
    if (!withdrawEntry || withdrawing) return
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      const res = await fetch(
        `/api/meets/${meetId}/signup/entry?athleteId=${encodeURIComponent(withdrawEntry.athleteId)}`,
        { method: "DELETE" }
      )
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setWithdrawError(data.error ?? "Failed to withdraw sign-up")
        return
      }
      setWithdrawEntry(null)
      router.refresh()
    } catch {
      setWithdrawError("Failed to withdraw sign-up")
    } finally {
      setWithdrawing(false)
    }
  }

  if (!showSection) return null

  return (
    <section>
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
        <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
          Sign-ups
        </h2>
        {isCoach && (
          <div className="flex flex-wrap items-center gap-1.5">
            <MeetSignupConfigButton
              meetId={meetId}
              eventCount={eventOptions.length}
              initial={
                form
                  ? {
                      enabled: form.enabled,
                      instructions: form.instructions,
                      minEvents: form.minEvents,
                      maxEvents: form.maxEvents,
                      maxRelayEvents: form.maxRelayEvents,
                      askNotes: form.askNotes,
                      customQuestions: form.customQuestions,
                      openAt: form.openAt,
                      closeAt: form.closeAt,
                      withdrawUntil: form.withdrawUntil,
                    }
                  : null
              }
            />
            {form && (
              <button
                type="button"
                onClick={() => setResponsesOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-border rounded-md dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:bg-background-elevated transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
                Responses{entries.length > 0 ? ` (${entries.length})` : ""}
              </button>
            )}
          </div>
        )}
        {form && (
          <span
            className={
              "text-xs px-2 py-0.5 rounded-full border border-border " +
              (window.open
                ? "border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40"
                : "border border-border text-foreground-tertiary dark:text-foreground-tertiary")
            }
          >
            {window.open ? "Open" : "Closed"}
          </span>
        )}
      </div>

      {!form && isCoach && (
        <p className="text-sm text-foreground-secondary dark:text-foreground-secondary">
          Set up a sign-up form so swimmers can enter events for this meet.
          {eventsFromEventOrder(eventOrder).length === 0
            ? " Import a meet packet first so the order of events is available."
            : ""}
        </p>
      )}

      {form && eventOptions.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Sign-ups need an order of events.{" "}
          {isCoach
            ? "Import the meet packet first."
            : "Ask a coach to import the meet packet."}
        </p>
      ) : null}

      {form && eventOptions.length > 0 && !isCoach ? (
        <MeetSignupAthleteForm
          meetId={meetId}
          course={course}
          eventOptions={eventOptions}
          minEvents={form.minEvents}
          maxEvents={form.maxEvents}
          maxRelayEvents={form.maxRelayEvents}
          askNotes={form.askNotes}
          instructions={form.instructions}
          customQuestions={questions}
          windowOpen={window.open}
          windowReason={window.reason}
          canWithdraw={withdraw.allowed}
          withdrawReason={withdraw.reason}
          withdrawDeadline={withdraw.deadline?.toISOString() ?? null}
          isCoach={false}
          isStaff={isStaff}
          selfAthleteId={selfAthleteId}
          athletes={athletes}
          entriesByAthleteId={entriesByAthleteId}
        />
      ) : null}

      {isCoach && form && (
        <>
          <Modal
            open={responsesOpen}
            onClose={() => {
              if (syncingRoster || withdrawing) return
              setResponsesOpen(false)
              setSyncConfirmOpen(false)
              setSyncError(null)
              setWithdrawEntry(null)
              setWithdrawError(null)
            }}
            closeDisabled={syncingRoster || withdrawing}
            title="Sign-up responses"
            description={`${entries.length} response${entries.length === 1 ? "" : "s"}`}
            maxWidth="5xl"
            footer={
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => {
                    setResponsesOpen(false)
                    setSyncConfirmOpen(false)
                    setSyncError(null)
                    setWithdrawEntry(null)
                    setWithdrawError(null)
                  }}
                  disabled={syncingRoster || withdrawing}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:border disabled:opacity-50"
                >
                  Close
                </button>
                {!hasImportedResults && (
                  <button
                    type="button"
                    onClick={openSyncConfirm}
                    disabled={
                      syncingRoster ||
                      withdrawing ||
                      entries.length === 0 ||
                      eventOptions.length === 0
                    }
                    className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
                  >
                    Add individual sign-ups to roster summary
                  </button>
                )}
              </ModalFooter>
            }
          >
            {entries.length === 0 ? (
              <p className="text-sm text-foreground-secondary text-foreground-secondary">No sign-ups yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-foreground-secondary text-foreground-secondary">
                    <tr>
                      <th className="px-2 py-2 font-medium">Athlete</th>
                      <th className="px-2 py-2 font-medium">Individual</th>
                      <th className="px-2 py-2 font-medium">Relay</th>
                      {questions.map((q) => (
                        <th key={q.id} className="px-2 py-2 font-medium">
                          {q.label}
                        </th>
                      ))}
                      {form.askNotes && (
                        <th className="px-2 py-2 font-medium">Notes</th>
                      )}
                      <th className="px-2 py-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-zinc-800">
                    {entries.map((entry) => {
                      const answers = isSignupAnswers(entry.answers) ? entry.answers : {}
                      const { individual, relay } = partitionSignupEvents(
                        sortSignupEventsByOrder(entry.events, eventOptions)
                      )
                      const renderEventChips = (events: string[]) =>
                        events.length === 0 ? (
                          <span className="text-xs text-gray-400 dark:text-zinc-500">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {events.map((ev) => {
                              const opt = optionByEvent.get(ev)
                              const label = opt
                                ? formatSignupEventLabel(opt, entry.gender)
                                : ev
                              const time = entry.entryTimes[ev]
                              return (
                                <span
                                  key={ev}
                                  className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-zinc-800"
                                >
                                  {label}
                                  {time ? ` · ${formatDisplayTime(time)}` : ""}
                                </span>
                              )
                            })}
                          </div>
                        )
                      return (
                        <tr key={entry.id} className="align-top">
                          <td className="px-2 py-2 whitespace-nowrap">
                            {entry.lastName}, {entry.firstName}
                          </td>
                          <td className="px-2 py-2">{renderEventChips(individual)}</td>
                          <td className="px-2 py-2">{renderEventChips(relay)}</td>
                          {questions.map((q) => (
                            <td key={q.id} className="px-2 py-2 text-foreground-secondary text-foreground-secondary">
                              {answers[q.id] || "—"}
                            </td>
                          ))}
                          {form.askNotes && (
                            <td className="px-2 py-2 text-foreground-secondary text-foreground-secondary max-w-xs">
                              {entry.notes || "—"}
                            </td>
                          )}
                          <td className="px-2 py-2 whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setWithdrawError(null)
                                setWithdrawEntry(entry)
                              }}
                              disabled={withdrawing}
                              className="text-xs px-2 py-1 rounded-md border border-border border-red-200 text-error hover:bg-red-50 dark:border-red-900 dark:text-error dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                            >
                              Withdraw
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>

          <Modal
            open={syncConfirmOpen}
            onClose={() => {
              if (syncingRoster) return
              setSyncConfirmOpen(false)
              setSyncError(null)
            }}
            closeDisabled={syncingRoster}
            busy={syncingRoster}
            title="Add to roster summary?"
            description="This updates Roster Summary entry seeds from individual event sign-ups. Relay interest is left alone. Athletes without a sign-up keep their existing rows."
            maxWidth="md"
            overlayClassName="z-[60]"
            footer={
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => {
                    setSyncConfirmOpen(false)
                    setSyncError(null)
                  }}
                  disabled={syncingRoster}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:border disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void syncIndividualSignupsToRoster()}
                  disabled={syncingRoster}
                  className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
                >
                  {syncingRoster ? "Adding…" : "Add"}
                </button>
              </ModalFooter>
            }
          >
            {syncError ? (
              <p className="text-sm text-error dark:text-error">{syncError}</p>
            ) : null}
          </Modal>

          <Modal
            open={withdrawEntry != null}
            onClose={() => {
              if (withdrawing) return
              setWithdrawEntry(null)
              setWithdrawError(null)
            }}
            closeDisabled={withdrawing}
            busy={withdrawing}
            title="Withdraw sign-up?"
            description={
              withdrawEntry
                ? `This removes ${withdrawEntry.firstName} ${withdrawEntry.lastName}'s meet sign-up and event selections.`
                : "This removes the meet sign-up and event selections."
            }
            maxWidth="md"
            overlayClassName="z-[60]"
            footer={
              <ModalFooter>
                <button
                  type="button"
                  onClick={() => {
                    setWithdrawEntry(null)
                    setWithdrawError(null)
                  }}
                  disabled={withdrawing}
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:border disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void withdrawSignup()}
                  disabled={withdrawing}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
                >
                  {withdrawing ? "Withdrawing…" : "Withdraw"}
                </button>
              </ModalFooter>
            }
          >
            {withdrawError ? (
                  <p className="text-sm text-error dark:text-error">{withdrawError}</p>
            ) : null}
          </Modal>
        </>
      )}
    </section>
  )
}
