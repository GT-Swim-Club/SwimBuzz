"use client"

import { useMemo, useState } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import MeetSignupConfigButton, { type MeetSignupConfigInitial } from "../MeetSignupConfigButton"
import type { MeetSignupEventOption, MeetSignupQuestion } from "@/lib/meet/meet-signup"
import {
  formatSignupEventLabel,
  partitionSignupEvents,
  sortSignupEventsByOrder,
} from "@/lib/meet/meet-signup"
import { formatDisplayTime } from "@/lib/utils"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"
import StaffBadge from "@/components/ui/StaffBadge"
import type { StaffTitle } from "@swimbuzz/shared"
import { syncSignupsToRoster, withdrawAthleteSignup } from "../meet-signup-admin.actions"
import ImportFormResponsesButton from "../ImportFormResponsesButton"

type SignupEntry = {
  id: string
  athleteId: string
  name: string
  gender: "M" | "F"
  staffTitle: StaffTitle | null
  events: string[]
  entryTimes: Record<string, string>
  notes: string
  answers: Record<string, string>
}

type Props = {
  meetId: string
  meetName: string
  course: string
  eventOptions: MeetSignupEventOption[]
  askNotes: boolean
  questions: MeetSignupQuestion[]
  configInitial: MeetSignupConfigInitial | null
  meetTimeZone: string
  entries: SignupEntry[]
}

export default function MeetSignupManager({
  meetId,
  meetName,
  eventOptions,
  askNotes,
  questions,
  configInitial,
  meetTimeZone,
  entries,
}: Props) {
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<"settings" | "responses">(
    configInitial ? "responses" : "settings"
  )
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [dropEntry, setDropEntry] = useState<SignupEntry | null>(null)
  const [dropping, setDropping] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? entries.filter((entry) => entry.name.toLowerCase().includes(needle)) : entries
  }, [entries, query])


  async function syncToRoster() {
    setSyncing(true)
    setSyncError(null)
    try {
      await syncSignupsToRoster(meetId)
      setSyncOpen(false)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Could not add sign-ups to the roster summary.")
    } finally {
      setSyncing(false)
    }
  }

  async function dropSignup() {
    if (!dropEntry || dropping) return
    setDropping(true)
    setDropError(null)
    try {
      await withdrawAthleteSignup(meetId, dropEntry.athleteId)
      setDropEntry(null)
    } catch (err) {
      setDropError(err instanceof Error ? err.message : "Could not drop this sign-up.")
    } finally {
      setDropping(false)
    }
  }

  function eventChips(entry: SignupEntry, events: string[]) {
    if (events.length === 0) return <span className="text-sm text-foreground-tertiary">None</span>
    return (
      <div className="flex flex-wrap gap-1.5">
        {events.map((event) => {
          const option = eventOptions.find((item) => item.event === event)
          const label = option ? formatSignupEventLabel(option, entry.gender) : event
          const time = entry.entryTimes[event]
          return (
            <span key={event} className="rounded-md bg-fill-secondary px-2 py-1 text-xs text-foreground-secondary">
              {label}{time ? ` · ${formatDisplayTime(time)}` : ""}
            </span>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <header>
        <h1 className="text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
          {meetName}
        </h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Sign-up management
        </p>
      </header>

      <SegmentedToggle
        selectedIndex={activeTab === "responses" ? 1 : 0}
        fullWidth
        className="rounded-xl border border-border bg-fill-secondary"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "settings"}
          aria-controls="signup-settings"
          onClick={() => setActiveTab("settings")}
          className={segmentedOptionClass(activeTab === "settings") + " py-2"}
        >
          Form settings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "responses"}
          aria-controls="signup-responses"
          onClick={() => setActiveTab("responses")}
          className={segmentedOptionClass(activeTab === "responses") + " py-2"}
        >
          Responses ({entries.length})
        </button>
      </SegmentedToggle>

      <div id="signup-settings" role="tabpanel" hidden={activeTab !== "settings"}>
        <MeetSignupConfigButton
          meetId={meetId}
          eventCount={eventOptions.length}
          initial={
            configInitial ?? {
              instructions: "",
              minEvents: null,
              maxEvents: null,
              maxRelayEvents: null,
              askNotes: true,
              customQuestions: [],
              openAt: null,
              closeAt: null,
              withdrawUntil: null,
              timeZone: meetTimeZone,
            }
          }
          inline
        />
      </div>

      <div id="signup-responses" role="tabpanel" hidden={activeTab !== "responses"}>
      <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium text-foreground">Responses</h2>
          <ImportFormResponsesButton meetId={meetId} formType="signup" />
        </div>

        {entries.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative block sm:w-64">
                <span className="sr-only">Search sign-ups</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search swimmers"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setSyncError(null)
                  setSyncOpen(true)
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-text hover:bg-primary-hover"
              >
                Add To Roster Summary
              </button>
            </div>
          </div>
        )}


        {filteredEntries.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-foreground-secondary">
            {entries.length === 0 ? "No one has submitted a sign-up yet." : "No sign-ups match that search."}
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {filteredEntries.map((entry) => {
              const { individual, relay } = partitionSignupEvents(entry.events)
              const sortedIndividual = sortSignupEventsByOrder(individual, eventOptions)
              const sortedRelay = sortSignupEventsByOrder(relay, eventOptions)
              return (
                <article key={entry.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-foreground">
                        {entry.name}
                        {entry.staffTitle && <StaffBadge title={entry.staffTitle} />}
                      </h3>
                      <p className="mt-1 text-xs text-foreground-tertiary">
                        {entry.events.length} event{entry.events.length === 1 ? "" : "s"} selected
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDropError(null)
                        setDropEntry(entry)
                      }}
                      className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-error transition-colors hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
                    >
                      Drop
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-foreground-tertiary">Individual</p>
                      {eventChips(entry, sortedIndividual)}
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-foreground-tertiary">Relay interest</p>
                      {eventChips(entry, sortedRelay)}
                    </div>

                    {(questions.length > 0 || askNotes) && (
                      <div className="border-t border-border pt-3 text-sm">
                        {questions.map((question) => (
                          <div key={question.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-1.5">
                            <span className="text-foreground-tertiary">{question.label}</span>
                            <span className="text-foreground-secondary">{entry.answers[question.id] || "—"}</span>
                          </div>
                        ))}
                        {askNotes && (
                          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-1.5">
                            <span className="text-foreground-tertiary">Notes</span>
                            <span className="whitespace-pre-wrap text-foreground-secondary">{entry.notes || "—"}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      </div>

      <Modal
        open={syncOpen}
        onClose={() => {
          if (syncing) return
          setSyncOpen(false)
          setSyncError(null)
        }}
        closeDisabled={syncing}
        busy={syncing}
        title="Add sign-ups to roster summary?"
        description="Individual event selections will be added to the roster summary. Relay interest stays unchanged."
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setSyncOpen(false)
                setSyncError(null)
              }}
              disabled={syncing}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void syncToRoster()}
              disabled={syncing}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {syncing ? "Adding…" : "Add"}
            </button>
          </ModalFooter>
        }
      >
        {syncError && <p className="text-sm text-error">{syncError}</p>}
      </Modal>

      <Modal
        open={dropEntry != null}
        onClose={() => {
          if (dropping) return
          setDropEntry(null)
          setDropError(null)
        }}
        closeDisabled={dropping}
        busy={dropping}
        title="Drop sign-up?"
        description={dropEntry ? `This removes ${dropEntry.name}'s event selections.` : undefined}
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setDropEntry(null)
                setDropError(null)
              }}
              disabled={dropping}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void dropSignup()}
              disabled={dropping}
              className="flex-1 rounded-lg bg-error px-4 py-2.5 text-sm font-medium text-error-contrast hover:bg-error-hover disabled:opacity-50"
            >
              {dropping ? "Dropping…" : "Drop"}
            </button>
          </ModalFooter>
        }
      >
        {dropError && <p className="text-sm text-error">{dropError}</p>}
      </Modal>
    </>
  )
}
