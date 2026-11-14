import Link from "next/link"
import { athletePreferredInitials, athletePreferredName } from "@swimbuzz/shared"
import type { QualifierAthlete, QualifierRow } from "@/lib/qualifiers/nationals-qualifiers"
import { qualifierMarginLabel } from "@/lib/qualifiers/qualifier-events"
import { athletePath } from "@/lib/slug"
import { QualifierSwimRow } from "./QualifierSwimRow"
import { athleteCutsLabel, meTintClass, qualifierAvatarClass, youPillClass } from "./qualifier-styles"

/**
 * Athlete · Event · Meet · Date · Time · Margin · Standard (md+; phones stack).
 * Meet stops growing at a readable width so wide windows widen the athlete column.
 */
export const QUALIFIER_LIST_COLS =
  "md:grid-cols-[minmax(10rem,1fr)_minmax(7rem,10rem)_minmax(5rem,18rem)_minmax(7rem,7.5rem)_5.5rem_4.5rem_6rem]"
/** The by-event list: Event · Athlete · Meet · Date · Time · Margin · Standard, sized like the athlete list. */
export const EVENT_LIST_COLS =
  "md:grid-cols-[minmax(10rem,1fr)_minmax(10rem,15rem)_minmax(5rem,18rem)_minmax(7rem,7.5rem)_5.5rem_4.5rem_6rem]"

/**
 * Each swim row sits on its parent's columns through subgrid, so every cell
 * lines up down the table. Phones get two lines per swim: event and time
 * (with the margin under the cut), then meet · date and the cut.
 */
export const swimRowClass =
  "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2.5 py-1 transition-colors md:col-span-full md:grid-cols-subgrid md:gap-x-2 md:px-0"
const swimCellClass = "min-w-0 truncate text-[15px] transition-colors group-hover:text-primary md:pl-2.5"
export const swimLeadCellClass = `${swimCellClass} font-medium text-foreground`
export const swimMetaCellClass = `${swimCellClass} font-medium text-foreground-secondary max-md:row-start-2 max-md:text-[13px]`
const swimTimeCellClass =
  "whitespace-nowrap text-right font-mono text-[15px] font-semibold tabular-nums text-foreground transition-colors group-hover:text-primary max-md:col-start-2 max-md:row-start-1"
const swimMarginCellClass =
  "text-right font-mono text-[15px] font-medium tabular-nums text-success-text transition-colors group-hover:text-primary max-md:hidden"
const swimCutCellClass =
  "min-w-0 truncate text-right font-mono text-[15px] font-medium tabular-nums text-foreground-secondary transition-colors group-hover:text-primary max-md:col-start-2 max-md:row-start-2 max-md:text-[13px] md:pr-2.5"

/**
 * The cells after a swim's lead cell (event or athlete): meet, date, time,
 * margin under the cut and the standard, on the parent's subgrid.
 */
export function SwimCells({ swim }: { swim: QualifierRow }) {
  const margin = qualifierMarginLabel(swim)
  return (
    <>
      <span className={swimMetaCellClass}>
        {swim.meetName || "Qualifying swim"}
        {swim.date ? <span className="md:hidden"> · {swim.date}</span> : null}
      </span>
      <span className={`${swimMetaCellClass} max-md:hidden`}>{swim.date || "—"}</span>
      <span className={swimTimeCellClass}>
        {swim.time}
        <span className="ml-1.5 text-[13px] font-medium text-success-text md:hidden">{margin}</span>
      </span>
      <span className={swimMarginCellClass}>{margin}</span>
      <span className={swimCutCellClass}>
        <span className="md:hidden">cut </span>
        {swim.cut || "—"}
      </span>
    </>
  )
}

export function QualifierListHeader({ cols, first, second }: { cols: string; first: string; second: string }) {
  return (
    <div
      className={`hidden gap-2 border-b border-border bg-fill-secondary/60 px-5 py-2 text-[11px] font-semibold tracking-[0.11em] text-foreground-tertiary md:grid ${cols}`}
    >
      <span>{first}</span>
      <span className="pl-2.5">{second}</span>
      <span className="pl-2.5">MEET</span>
      <span className="pl-2.5">DATE</span>
      <span className="text-right">TIME</span>
      <span className="text-right">MARGIN</span>
      <span className="pr-2.5 text-right">STANDARD</span>
    </div>
  )
}

/** Qualifiers by athlete in the list layout: one row per athlete, a line per cut. */
export default function QualifiersList({
  qualifiers,
  currentAthleteId,
  showGender,
}: {
  qualifiers: QualifierAthlete[]
  currentAthleteId: string | null
  showGender: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <QualifierListHeader cols={QUALIFIER_LIST_COLS} first="ATHLETE" second="EVENT" />
      <div className="divide-y divide-border">
        {qualifiers.map((athlete) => {
          const isMe = athlete.athleteId === currentAthleteId
          const athleteHref = athletePath(athlete.athleteSlug ?? athlete.athleteId)
          const name = athletePreferredName(athlete)
          return (
            <article
              key={athlete.athleteId}
              className={`grid gap-2 px-3 py-2 sm:px-5 ${QUALIFIER_LIST_COLS} ${isMe ? meTintClass : ""}`}
            >
              <div className="flex items-center gap-2.5 self-start max-md:px-2.5">
                <Link
                  href={athleteHref}
                  aria-label={`View ${name}`}
                  className={`${qualifierAvatarClass} hover:border-primary`}
                >
                  {athletePreferredInitials(athlete)}
                </Link>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Link
                      href={athleteHref}
                      className="truncate text-base font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                    >
                      {name}
                    </Link>
                    {isMe ? <span className={youPillClass}>You</span> : null}
                  </div>
                  <p className="mt-0.5 whitespace-nowrap text-[13px] text-foreground-secondary">
                    {athleteCutsLabel(athlete.gender, athlete.events.length, showGender)}
                  </p>
                </div>
              </div>

              <div className="grid min-w-0 content-start gap-y-0.5 md:col-span-6 md:grid-cols-subgrid">
                {athlete.events.map((event) => (
                  <QualifierSwimRow key={event.id} swim={event} className={swimRowClass}>
                    <span className={swimLeadCellClass}>{event.event}</span>
                    <SwimCells swim={event} />
                  </QualifierSwimRow>
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
