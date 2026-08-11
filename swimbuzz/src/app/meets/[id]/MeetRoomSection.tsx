"use client"

import { roomWindowStatus } from "@/lib/meet-rooms"
import { formatDateTime } from "@/lib/utils"
import type { MeetSignupQuestion } from "@/lib/meet-signup"
import MeetRoomConfigButton from "./MeetRoomConfigButton"
import MeetRoomPreferenceForm from "./MeetRoomPreferenceForm"
import MeetRoomAssignmentEditor from "./MeetRoomAssignmentEditor"
import MeetRoomAssignmentsList from "./MeetRoomAssignmentsList"

type AthleteOption = { id: string; name: string; gender: "M" | "F" }

type FormData = {
  id: string
  instructions: string
  maxPreferences: number
  openAt: string | null
  closeAt: string | null
  assignmentsPublishedAt: string | null
  customQuestions: MeetSignupQuestion[]
}

type PreferenceRow = {
  id: string
  athleteId: string
  firstName: string
  lastName: string
  gender: "M" | "F"
  preferredAthleteIds: string[]
  excludedAthleteIds: string[]
  notes: string
  answers: Record<string, string>
  updatedAt: string
}

type RoomRow = {
  id: string
  label: string
  sortOrder: number
  athleteIds: string[]
  athletes: Array<{ id: string; firstName: string; lastName: string }>
}

export default function MeetRoomSection({
  meetId,
  isCoach,
  selfAthleteId,
  athletes,
  form,
  myPreference,
  preferences,
  rooms,
  meetHasEnded,
}: {
  meetId: string
  isCoach: boolean
  selfAthleteId: string | null
  athletes: AthleteOption[]
  form: FormData | null
  myPreference: {
    preferredAthleteIds: string[]
    excludedAthleteIds: string[]
    notes: string
    answers: Record<string, string>
    updatedAt: string
  } | null
  preferences: PreferenceRow[]
  rooms: RoomRow[]
  meetHasEnded: boolean
}) {
  const window = form
    ? roomWindowStatus({
        openAt: form.openAt ? new Date(form.openAt) : null,
        closeAt: form.closeAt ? new Date(form.closeAt) : null,
      })
    : { open: false, reason: "Roommate preferences have not been set up yet." }

  if (meetHasEnded) return null

  return (
    <section>
      <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-3">
        <h2 className="text-sm font-medium text-foreground-secondary uppercase tracking-wide">
          Roommates
        </h2>
        {isCoach && (
          <MeetRoomConfigButton
            meetId={meetId}
            initial={
              form
                ? {
                    instructions: form.instructions,
                    maxPreferences: form.maxPreferences,
                    openAt: form.openAt,
                    closeAt: form.closeAt,
                    customQuestions: form.customQuestions,
                  }
                : null
            }
          />
        )}
        {form && (
          <span
            className={
              "text-xs px-2 py-0.5 rounded-full border " +
              (window.open
                ? "border-emerald-300 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/40"
                : "border-border text-foreground-tertiary")
            }
          >
            {window.open ? "Open" : "Closed"}
          </span>
        )}
      </div>

      {!form && isCoach && (
        <p className="text-sm text-foreground-secondary">
          Set up a roommate preference form so swimmers can submit who they&apos;d like to room with.
        </p>
      )}

      {form &&
        ((form.openAt && new Date(form.openAt) > new Date()) ||
          (form.closeAt && new Date(form.closeAt) > new Date())) && (
        <div className="text-sm text-foreground-secondary flex flex-col gap-y-1 mb-3">
          {form.openAt && new Date(form.openAt) > new Date() && (
            <span>Opens: {formatDateTime(new Date(form.openAt))}</span>
          )}
          {form.closeAt && new Date(form.closeAt) > new Date() && (
            <span>Closes: {formatDateTime(new Date(form.closeAt))}</span>
          )}
        </div>
      )}

      {form && !isCoach && (
        <>
          <MeetRoomPreferenceForm
            meetId={meetId}
            maxPreferences={form.maxPreferences}
            instructions={form.instructions}
            customQuestions={form.customQuestions}
            openAt={form.openAt}
            closeAt={form.closeAt}
            isCoach={isCoach}
            selfAthleteId={selfAthleteId}
            athletes={athletes}
            myPreference={myPreference}
          />

          {form.assignmentsPublishedAt && (
            <MeetRoomAssignmentsList
              rooms={rooms.map((r) => ({
                athletes: r.athletes,
              }))}
              selfAthleteId={selfAthleteId}
            />
          )}
        </>
      )}

      {form && isCoach && (
        <MeetRoomAssignmentEditor
          meetId={meetId}
          athletes={athletes}
          customQuestions={form.customQuestions}
          preferences={preferences}
          initialRooms={rooms.map((r) => ({
            athleteIds: r.athleteIds,
          }))}
          assignmentsPublishedAt={form.assignmentsPublishedAt}
          meetHasEnded={meetHasEnded}
        />
      )}
    </section>
  )
}
