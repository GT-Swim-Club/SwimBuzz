"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
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
import MeetSignupAthleteForm from "./MeetSignupAthleteForm"
import StaffBadge from "@/components/StaffBadge"
import type { StaffTitle } from "@swimbuzz/shared"

type EntryRow = {
  id: string
  athleteId: string
  firstName: string
  lastName: string
  gender: "M" | "F"
  staffTitle: StaffTitle | null
  events: string[]
  entryTimes: Record<string, string>
  notes: string
  answers: unknown
  updatedAt: string
}

type FormData = {
  id: string
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
  meetPath,
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
  meetPath: string
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

  // Poll signup status every 10 seconds to detect when signups open/close in real-time
  useEffect(() => {
    // Only poll if there's a signup form configured (even if closed)
    if (!form) return

    let initialTimeout: NodeJS.Timeout | null = null
    let pollInterval: NodeJS.Timeout | null = null
    let hasStartedPolling = false

    const checkAndRefreshSignupStatus = async () => {
      try {
        const response = await fetch(`/api/meets/${meetId}/signup`, {
          method: "GET",
          cache: "no-store",
        })
        if (response.ok) {
          // If we got a successful response, refresh to update the component
          router.refresh()
        }
      } catch {
        // Silently handle errors - polling continues
      }
    }

    // Sync to minute boundary, then poll every 10 seconds
    const schedulePolling = () => {
      if (hasStartedPolling) return
      hasStartedPolling = true

      // Start polling every 10 seconds
      pollInterval = setInterval(checkAndRefreshSignupStatus, 10000)
    }

    // Calculate time until next minute boundary
    const timeUntilNextMinute = 60000 - ((Date.now() % 60000) + 500)
    initialTimeout = setTimeout(() => {
      checkAndRefreshSignupStatus()
      schedulePolling()
    }, timeUntilNextMinute)

    return () => {
      if (initialTimeout) clearTimeout(initialTimeout)
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [router, meetId, form])
  const eventOptions = resolveSignupEventOptions(eventOrder)
  const optionByEvent = new Map(eventOptions.map((o) => [o.event, o]))
  const questions = form ? form.customQuestions : []
  const window = form
    ? signupWindowStatus({
        openAt: form.openAt ? new Date(form.openAt) : null,
        closeAt: form.closeAt ? new Date(form.closeAt) : null,
      })
    : { open: false, reason: "Sign-ups have not been set up yet." }
  const withdraw = form
    ? signupWithdrawStatus({
        openAt: form.openAt ? new Date(form.openAt) : null,
        closeAt: form.closeAt ? new Date(form.closeAt) : null,
        withdrawUntil: form.withdrawUntil ? new Date(form.withdrawUntil) : null,
      })
    : { allowed: false, reason: null, deadline: null }

  const openAtDate = form?.openAt ? new Date(form.openAt) : null
  const closeAtDate = form?.closeAt ? new Date(form.closeAt) : null
  const now = new Date()
  const showAthleteForm = Boolean(
    form &&
      !isCoach &&
      openAtDate &&
      (openAtDate > now || (closeAtDate ? closeAtDate > now : true) || myEntry)
  )
  const showSection = isCoach || showAthleteForm || (entries && entries.length > 0)

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
      setWithdrawError(data.error ?? "Failed to drop sign-up")
        return
      }
      setWithdrawEntry(null)
      router.refresh()
    } catch {
      setWithdrawError("Failed to drop sign-up")
    } finally {
      setWithdrawing(false)
    }
  }

  if (!showSection) return null

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-foreground-secondary">
          Sign-ups
        </h2>
        {form && (
          <span
            className={
              "rounded-full border px-2 py-0.5 text-xs " +
              (window.open
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-border text-foreground-tertiary"
              )
            }
          >
            {window.open ? "Open" : "Closed"}
          </span>
        )}
      </div>

      {isCoach && (
        <Link
          href={`${meetPath}/signups`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-text transition-colors hover:bg-primary-hover"
        >
          {form ? "Manage sign-ups" : "Set up sign-ups"}
          <span aria-hidden="true">→</span>
        </Link>
      )}

      {form && eventOptions.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Sign-ups need an order of events.{" "}
          {isCoach
            ? "Import the meet packet first."
            : "Ask a coach to import the meet packet."}
        </p>
      ) : null}

      {form && eventOptions.length > 0 && !isCoach && isStaff ? (
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
          formOpenAt={form.openAt}
          formCloseAt={form.closeAt}
          formWithdrawUntil={form.withdrawUntil}
          isCoach={false}
          isStaff={isStaff}
          selfAthleteId={selfAthleteId}
          athletes={athletes}
          entriesByAthleteId={entriesByAthleteId}
        />
      ) : null}

      {form && eventOptions.length > 0 && !isCoach && !isStaff ? (
        <>
          {!window.open && !myEntry && window.reason && (
            <p className="mb-3 text-sm text-foreground-secondary">{window.reason}</p>
          )}
          {(window.open || myEntry) && (
            <Link
              href={`${meetPath}/signup`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-text transition-colors hover:bg-primary-hover"
            >
              {myEntry ? "Review sign-up" : "Open sign-up"}
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </>
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
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill disabled:opacity-50"
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
              <p className="text-sm text-foreground-secondary">No sign-ups yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-foreground-secondary">
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
                  <tbody className="divide-y divide-border">
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
                                  className="text-xs px-1.5 py-0.5 rounded bg-fill-secondary"
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
                            {entry.staffTitle && <StaffBadge title={entry.staffTitle} />}
                          </td>
                          <td className="px-2 py-2">{renderEventChips(individual)}</td>
                          <td className="px-2 py-2">{renderEventChips(relay)}</td>
                          {questions.map((q) => (
                            <td key={q.id} className="px-2 py-2 text-foreground-secondary">
                              {answers[q.id] || "—"}
                            </td>
                          ))}
                          {form.askNotes && (
                            <td className="px-2 py-2 text-foreground-secondary max-w-xs">
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
                              className="text-xs px-2 py-1 rounded-md border border-border border-red-200 text-error hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                            >
                              Drop
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
            title="Add To Roster Summary?"
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
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill disabled:opacity-50"
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
              <p className="text-sm text-error">{syncError}</p>
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
            title="Drop sign-up?"
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
                  className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void withdrawSignup()}
                  disabled={withdrawing}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-red-700 disabled:opacity-50"
                >
                  {withdrawing ? "Dropping…" : "Drop"}
                </button>
              </ModalFooter>
            }
          >
            {withdrawError ? (
                  <p className="text-sm text-error">{withdrawError}</p>
            ) : null}
          </Modal>
        </>
      )}
    </section>
  )
}
