import Link from "next/link"
import { RelativeInstantTime } from "@/components/ui/RelativeDate"
import { roomWindowStatus } from "@/lib/meet/meet-rooms"
import type { MeetSignupQuestion } from "@/lib/meet/meet-signup"
import MeetRoomAssignmentsList from "./MeetRoomAssignmentsList"
import { LedgerNote, LedgerRow } from "@/components/meet/Ledger"

type FormData = {
  id: string
  instructions: string
  maxPreferences: number
  openAt: string | null
  closeAt: string | null
  assignmentsPublishedAt: string | null
  customQuestions: MeetSignupQuestion[]
}

type RoomRow = {
  id: string
  label: string
  sortOrder: number
  athleteIds: string[]
  athletes: Array<{ id: string; firstName: string; lastName: string }>
}

type Preference = {
  preferredAthleteIds: string[]
  excludedAthleteIds: string[]
  notes: string
  answers: Record<string, string>
  updatedAt: string
}

export default function MeetRoomSection({
  meetPath,
  isCoach,
  selfAthleteId,
  athletes,
  form,
  myPreference,
  rooms,
  meetHasEnded,
  variant = "section",
}: {
  athletes: Array<{ id: string; name: string; gender: "M" | "F" }>
  preferences: unknown[]
  meetPath: string
  meetId: string
  isCoach: boolean
  selfAthleteId: string | null
  form: FormData | null
  myPreference: Preference | null
  rooms: RoomRow[]
  meetHasEnded: boolean
  /** "ledger" renders bare rows for embedding in the sidebar Travel card. */
  variant?: "section" | "ledger"
}) {
  const window = form
    ? roomWindowStatus({
        openAt: form.openAt ? new Date(form.openAt) : null,
        closeAt: form.closeAt ? new Date(form.closeAt) : null,
      })
    : { open: false, reason: "Roommate preferences have not been set up yet." }

  if (meetHasEnded) return null

  if (
    !isCoach &&
    (!selfAthleteId || !athletes.some((a) => a.id === selfAthleteId))
  ) {
    return null
  }

  if (variant === "ledger") {
    if (isCoach) {
      return (
        <LedgerRow
          icon="bed"
          label={form ? "Manage roommates" : "Set up roommates"}
          href={`${meetPath}/roommates`}
        />
      )
    }
    if (!form) return null
    return (
      <>
        {window.open || myPreference ? (
          <LedgerRow
            icon="bed"
            label={myPreference ? "Review roommate preferences" : "Roommate preferences"}
            href={`${meetPath}/roommate`}
          />
        ) : window.reason ? (
          <LedgerNote>{window.reason}</LedgerNote>
        ) : null}
        {form.assignmentsPublishedAt && rooms.length > 0 ? (
          <div className="border-t border-border px-4 pb-4 [&>div]:mt-3">
            <MeetRoomAssignmentsList
              rooms={rooms.map((room) => ({ athletes: room.athletes }))}
              selfAthleteId={selfAthleteId}
            />
          </div>
        ) : null}
      </>
    )
  }

  if (isCoach) {
    return (
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-foreground-secondary">
            Roommates
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
        <Link
          href={`${meetPath}/roommates`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-text transition-colors hover:bg-primary-hover"
        >
          {form ? "Manage roommates" : "Set up roommates"}
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    )
  }

  if (!form) return null


  return (
    <section className="space-y-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-foreground-secondary">
          Roommates
        </h2>
        <span
          className={
            "rounded-full border px-2 py-0.5 text-xs " +
            (window.open
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-border text-foreground-tertiary")
          }
        >
          {window.open ? "Open" : "Closed"}
        </span>
      </div>

      <>
        {form.openAt && new Date(form.openAt) > new Date() && (
          <p className="text-sm text-foreground-secondary">
            Opens:{" "}
            <RelativeInstantTime at={form.openAt} />
          </p>
        )}
        {form.closeAt && new Date(form.closeAt) > new Date() && (
          <p className="text-sm text-foreground-secondary">
            Closes:{" "}
            <RelativeInstantTime at={form.closeAt} />
          </p>
        )}
        <Link
          href={`${meetPath}/roommate`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-text transition-colors hover:bg-primary-hover"
        >
          {myPreference ? "Review preferences" : "Open preferences"}
          <span aria-hidden="true">→</span>
        </Link>
      </>

      {form.assignmentsPublishedAt && (
        <MeetRoomAssignmentsList
          rooms={rooms.map((room) => ({ athletes: room.athletes }))}
          selfAthleteId={selfAthleteId}
        />
      )}
    </section>
  )
}
