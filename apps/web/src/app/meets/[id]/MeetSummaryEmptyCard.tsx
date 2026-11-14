"use client"

import type { ReactNode } from "react"
import { LedgerCard, LedgerIcon, ledgerRowClass } from "@/components/meet/Ledger"
import ImportMeetResourcesButton from "./ImportMeetResourcesButton"
import ImportSignupsButton from "./ImportSignupsButton"
import ImportMeetRosterButton from "./ImportMeetRosterButton"
import MeetAddMenu from "./MeetAddMenu"

/** One step of the staff checklist: a row that opens its dialog, ticked once it's done. */
function StepRow({
  done,
  label,
  status,
  onClick,
}: {
  done: boolean
  label: string
  status?: ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={`${ledgerRowClass} cursor-pointer hover:bg-background-hover`}>
      <span className="inline-flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            done ? "border-accent bg-accent/15 text-accent" : "border-border text-transparent"
          }`}
        >
          <LedgerIcon name="check" className="h-3 w-3" />
        </span>
        <span className="truncate">{label}</span>
        <span className="sr-only">{done ? "(done)" : "(not done)"}</span>
      </span>
      <span className="shrink-0 text-xs text-foreground-secondary">{status ?? <span aria-hidden>›</span>}</span>
    </button>
  )
}

/**
 * Where the roster summary goes, before there's anything in it (no sign-ups, roster, sheets or
 * results). Athletes are told what will show up here and when; staff get the steps that fill it in,
 * in order, each opening the dialog that does it — plus "+" to add entries or athletes by hand.
 */
export default function MeetSummaryEmptyCard({
  isCoach,
  meetId,
  meetName,
  meetHasEnded,
  hasEventOrder,
  importedSignups,
  rosterCount,
  hasSheets,
  hasResults,
  season,
  course,
  defaultDate,
  resourceInitial,
  athletes,
}: {
  isCoach: boolean
  meetId: string
  meetName: string
  meetHasEnded: boolean
  /** The packet's order of events is in (the Competition card lists it). */
  hasEventOrder: boolean
  /** Responses in the last sign-up import, or null if none yet. */
  importedSignups: number | null
  /** Athletes on the imported final roster, or null if none yet. */
  rosterCount: number | null
  /** An entries, psych or heat sheet is on the meet. */
  hasSheets: boolean
  /** A results file or SwimPhone link is on the meet. */
  hasResults: boolean
  season: string
  course: string
  defaultDate: string
  resourceInitial: Parameters<typeof ImportMeetResourcesButton>[0]["initial"]
  athletes: { id: string; name: string; gender?: "M" | "F" }[]
}) {
  if (!isCoach) {
    return (
      <LedgerCard title="Roster Summary">
        <p className="border-t border-border px-4 py-4 text-sm text-foreground-secondary">
          {meetHasEnded
            ? "No results have been posted for this meet yet. Times, places and splits show here once the coaches import them."
            : "Entries aren't posted yet. Your events, heats, lanes and seed times show here once the coaches import the sign-ups or the psych and heat sheets."}
          {!meetHasEnded && hasEventOrder ? " The order of events is under Competition." : ""}
        </p>
      </LedgerCard>
    )
  }

  return (
    <LedgerCard
      title="Roster Summary"
      aside={
        <MeetAddMenu
          meetId={meetId}
          meetName={meetName}
          defaultCourse={course}
          defaultDate={defaultDate}
          athletes={athletes}
          rosterSummaryEntries={[]}
          variant="ledger"
        />
      }
    >
      <p className="border-t border-border px-4 py-3 text-sm text-foreground-secondary">
        Nothing here yet. Fill in the roster summary — athletes see their events here as soon as it has any.
      </p>
      {!meetHasEnded ? (
        <>
          <ImportSignupsButton
            meetId={meetId}
            trigger={(open) => (
              <StepRow
                done={importedSignups != null}
                label="Import sign-ups"
                status={importedSignups != null ? `${importedSignups} imported` : undefined}
                onClick={open}
              />
            )}
          />
          <ImportMeetRosterButton
            meetId={meetId}
            rosterCount={rosterCount}
            trigger={(open) => (
              <StepRow
                done={rosterCount != null}
                label="Import the final roster"
                status={rosterCount != null ? `${rosterCount} on roster` : undefined}
                onClick={open}
              />
            )}
          />
        </>
      ) : null}
      <ImportMeetResourcesButton
        meetId={meetId}
        season={season}
        course={course}
        initial={resourceInitial}
        trigger={(open) => (
          <StepRow
            done={meetHasEnded ? hasResults : hasSheets}
            label={meetHasEnded ? "Upload the results" : "Upload the psych or heat sheets"}
            onClick={open}
          />
        )}
      />
      <p className="border-t border-border px-4 py-[11px] text-xs text-foreground-tertiary">
        Or add entries, swims and athletes by hand with +.
      </p>
    </LedgerCard>
  )
}
