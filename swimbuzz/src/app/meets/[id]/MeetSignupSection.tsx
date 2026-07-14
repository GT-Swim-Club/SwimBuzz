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
}) {
  const [responsesOpen, setResponsesOpen] = useState(false)
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false)
  const [syncingRoster, setSyncingRoster] = useState(false)
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
    if (syncingRoster || entries.length === 0) return

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
    if (entries.length === 0 || eventOptions.length === 0 || syncingRoster) return
    setSyncError(null)
    setSyncConfirmOpen(true)
  }

  if (!showSection) return null

  return (
    <section>
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
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
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
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
              "text-xs px-2 py-0.5 rounded-full border " +
              (window.open
                ? "border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40"
                : "border-gray-300 text-gray-500 dark:border-zinc-700 dark:text-zinc-400")
            }
          >
            {window.open ? "Open" : "Closed"}
          </span>
        )}
      </div>

      {!form && isCoach && (
        <p className="text-sm text-gray-500 dark:text-zinc-400">
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
              if (syncingRoster) return
              setResponsesOpen(false)
              setSyncConfirmOpen(false)
              setSyncError(null)
            }}
            closeDisabled={syncingRoster}
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
                  }}
                  disabled={syncingRoster}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={openSyncConfirm}
                  disabled={
                    syncingRoster ||
                    entries.length === 0 ||
                    eventOptions.length === 0
                  }
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Add individual sign-ups to roster summary
                </button>
              </ModalFooter>
            }
          >
            {entries.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-zinc-400">No sign-ups yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-zinc-400">
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
                            <td key={q.id} className="px-2 py-2 text-gray-600 dark:text-zinc-300">
                              {answers[q.id] || "—"}
                            </td>
                          ))}
                          {form.askNotes && (
                            <td className="px-2 py-2 text-gray-600 dark:text-zinc-300 max-w-xs">
                              {entry.notes || "—"}
                            </td>
                          )}
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
                  className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void syncIndividualSignupsToRoster()}
                  disabled={syncingRoster}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {syncingRoster ? "Adding…" : "Add"}
                </button>
              </ModalFooter>
            }
          >
            {syncError ? (
              <p className="text-sm text-red-600 dark:text-red-400">{syncError}</p>
            ) : null}
          </Modal>
        </>
      )}
    </section>
  )
}
