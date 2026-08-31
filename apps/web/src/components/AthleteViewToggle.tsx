"use client"

import { useOptimistic, useTransition } from "react"
import HoverDetail from "@/components/HoverDetail"
import { STAFF_TITLE_LABELS, type StaffTitle } from "@swimbuzz/shared"
import { ATHLETE_VIEW_ENABLING_EVENT } from "@/lib/athlete-view"
import { setAthleteView } from "./AthleteViewToggle.actions"

function AthleteViewIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 9.25h16" />
      <path d="M7.5 9.25 9 4h6l1.5 5.25" />
      <path d="M8.25 10.5v1.75a3.75 3.75 0 0 0 7.5 0V10.5" />
      <path d="M8.25 11.75c1.05-.55 2.3-.8 3.75-.8s2.7.25 3.75.8" />
      <path d="M4.75 21 7.25 15.5 12 19.5l4.75-4L19.25 21" />
      <path d="M9.25 17.25 12 19.5l2.75-2.25" />
    </svg>
  )
}

/**
 * Plain self-toggle between a staff member's own staff view and their own
 * athlete view — staff are roster athletes now, so there's no separate
 * "preview as a specific athlete" dimension to pick from anymore.
 */
export default function AthleteViewToggle({
  staffTitle,
  athleteViewEnabled,
  compact = false,
}: {
  staffTitle: StaffTitle
  /** Current state of the ATHLETE_VIEW_COOKIE, so the toggle reflects reality rather than assuming staff view is active. */
  athleteViewEnabled: boolean
  compact?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(athleteViewEnabled)
  const staffLabel = STAFF_TITLE_LABELS[staffTitle]

  function handleSetAthleteView(enabled: boolean) {
    if (enabled) window.dispatchEvent(new Event(ATHLETE_VIEW_ENABLING_EVENT))
    startTransition(async () => {
      setOptimisticEnabled(enabled)
      await setAthleteView(enabled)
    })
  }

  const activeClass = "bg-primary-bg text-primary"
  const inactiveClass = "text-foreground-tertiary hover:bg-fill-secondary hover:text-foreground"

  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-border-secondary bg-background p-0.5 text-xs">
      <button
        type="button"
        onClick={() => handleSetAthleteView(false)}
        disabled={pending}
        aria-pressed={!optimisticEnabled}
        title={`${staffLabel} View`}
        className={
          "group relative inline-flex h-full items-center justify-center gap-1.5 rounded-md px-2.5 font-medium transition-colors disabled:opacity-50 " +
          (optimisticEnabled ? inactiveClass : activeClass)
        }
      >
        <AthleteViewIcon />
        {compact ? <HoverDetail label={`${staffLabel} View`} /> : <span className="truncate">{staffLabel}</span>}
      </button>
      <button
        type="button"
        onClick={() => handleSetAthleteView(true)}
        disabled={pending}
        aria-pressed={optimisticEnabled}
        aria-label="Athlete View"
        title="Athlete View"
        className={
          "inline-flex h-full items-center justify-center rounded-md px-2.5 font-medium transition-colors disabled:opacity-50 " +
          (optimisticEnabled ? activeClass : inactiveClass)
        }
      >
        {compact ? "A" : "Athlete"}
      </button>
    </div>
  )
}
