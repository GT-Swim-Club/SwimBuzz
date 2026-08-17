"use client"

import { useMemo, useState } from "react"
import { athletePreferredNameLastFirst } from "@swimbuzz/shared"
import type { MeetSignupQuestion } from "@/lib/meet-signup"
import MeetRoomAssignmentEditor from "../MeetRoomAssignmentEditor"
import MeetRoomConfigButton, {
  type MeetRoomConfigInitial,
} from "../MeetRoomConfigButton"
import { SegmentedToggle, segmentedOptionClass } from "@/components/SegmentedToggle"

type AthleteOption = {
  id: string
  name: string
  gender: "M" | "F"
}

type PreferenceRow = {
  athleteId: string
  firstName: string
  lastName: string
  nicknames: string[]
  preferredAthleteIds: string[]
  excludedAthleteIds: string[]
  notes: string
  answers: Record<string, string>
}

type RoomRow = { athleteIds: string[] }

type Props = {
  meetId: string
  meetName: string
  configInitial: MeetRoomConfigInitial | null
  athletes: AthleteOption[]
  questions: MeetSignupQuestion[]
  preferences: PreferenceRow[]
  rooms: RoomRow[]
  assignmentsPublishedAt: string | null
  meetHasEnded: boolean
}

const tabClass = (active: boolean) => segmentedOptionClass(active) + " py-2"

export default function MeetRoommateManager({
  meetId,
  meetName,
  configInitial,
  athletes,
  questions,
  preferences,
  rooms,
  assignmentsPublishedAt,
  meetHasEnded,
}: Props) {
  const [activeTab, setActiveTab] = useState<"settings" | "responses">(
    "settings"
  )
  const [query, setQuery] = useState("")
  const athleteNameById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete.name])),
    [athletes]
  )
  const filteredPreferences = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return preferences
    return preferences.filter((preference) => {
      const name = athletePreferredNameLastFirst(preference)
      return name.toLowerCase().includes(normalizedQuery)
    })
  }, [preferences, query])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl">
          {meetName}
        </h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          Roommate preferences
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
          onClick={() => setActiveTab("settings")}
          className={tabClass(activeTab === "settings")}
        >
          Form settings
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "responses"}
          onClick={() => setActiveTab("responses")}
          className={tabClass(activeTab === "responses")}
        >
          Responses ({preferences.length})
        </button>
      </SegmentedToggle>

      <div
        id="roommate-settings"
        role="tabpanel"
        hidden={activeTab !== "settings"}
      >
        <MeetRoomConfigButton
          meetId={meetId}
          initial={configInitial}
          inline
        />
      </div>

      <div
        id="roommate-responses"
        role="tabpanel"
        hidden={activeTab !== "responses"}
      >
        {!configInitial ? (
          <section className="rounded-2xl border border-dashed border-border bg-background p-8 text-center text-sm text-foreground-secondary">
            Set up roommate preferences first.
          </section>
        ) : (
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-medium text-foreground">
                    Responses
                  </h2>
                  <span className="rounded-full bg-fill-secondary px-2 py-0.5 text-xs font-medium text-foreground-secondary">
                    {preferences.length}
                  </span>
                </div>
                {preferences.length > 0 && (
                  <label className="relative block sm:w-64">
                    <span className="sr-only">Search preferences</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search swimmers"
                      className={
                        "w-full rounded-lg border border-border bg-background px-3 py-2 " +
                        "text-sm text-foreground"
                      }
                    />
                  </label>
                )}
              </div>

              {filteredPreferences.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-foreground-secondary">
                  {preferences.length === 0
                    ? "No roommate preferences have been submitted yet."
                    : "No preferences match that search."}
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {filteredPreferences.map((preference) => (
                    <article
                      key={preference.athleteId}
                      className="rounded-xl border border-border bg-background p-4"
                    >
                      <h3 className="font-medium text-foreground">
                        {athletePreferredNameLastFirst(preference)}
                      </h3>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="grid gap-3 sm:grid-cols-2">
                        <PreferenceList
                          title="Wants to room with"
                          athleteIds={preference.preferredAthleteIds}
                          athleteNameById={athleteNameById}
                        />
                        <PreferenceList
                          title="Does not want to room with"
                          athleteIds={preference.excludedAthleteIds}
                          athleteNameById={athleteNameById}
                        />
                        </div>
                        {questions.map((question) => {
                          const answer = preference.answers[question.id]
                          if (!answer) return null
                          return (
                            <div
                              key={question.id}
                              className="border-t border-border pt-3"
                            >
                              <p className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                                {question.label}
                              </p>
                              <p className="mt-1 text-foreground-secondary">
                                {answer}
                              </p>
                            </div>
                          )
                        })}
                        {preference.notes && (
                          <div className="border-t border-border pt-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                              Notes
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-foreground-secondary">
                              {preference.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
              <div className="mb-5">
                <h2 className="text-base font-medium text-foreground">
                  Room assignments
                </h2>
              </div>
              <MeetRoomAssignmentEditor
                meetId={meetId}
                athletes={athletes}
                customQuestions={questions}
                preferences={preferences}
                initialRooms={rooms}
                assignmentsPublishedAt={assignmentsPublishedAt}
                meetHasEnded={meetHasEnded}
                showPreferences={false}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function PreferenceList({
  title,
  athleteIds,
  athleteNameById,
}: {
  title: string
  athleteIds: string[]
  athleteNameById: Map<string, string>
}) {
  const names = athleteIds.map(
    (athleteId) => athleteNameById.get(athleteId) ?? "Unknown"
  )
  return (
    <div className="rounded-lg bg-fill-secondary px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">
        {title}
      </p>
      <p className="mt-1 text-foreground-secondary">
        {names.length > 0 ? names.join(", ") : "None selected"}
      </p>
    </div>
  )
}
