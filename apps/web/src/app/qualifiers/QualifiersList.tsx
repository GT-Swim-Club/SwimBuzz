import Link from "next/link"
import { athletePreferredInitials, athletePreferredName } from "@swimbuzz/shared"
import type { QualifierAthlete } from "@/lib/qualifiers/nationals-qualifiers"
import { athletePath } from "@/lib/slug"
import { QualifierSwimRow } from "./QualifierSwimRow"

/** Athlete · Event · Meet · Date · Time · Standard (md+; phones stack). */
export const QUALIFIER_LIST_COLS =
  "md:grid-cols-[minmax(10rem,15rem)_minmax(7rem,10rem)_minmax(5rem,1fr)_minmax(5.5rem,6.5rem)_5.5rem_6rem]"
/** The by-event list: Event · Athlete · Meet · Date · Time · Standard. */
export const EVENT_LIST_COLS =
  "md:grid-cols-[minmax(7rem,10rem)_minmax(10rem,15rem)_minmax(5rem,1fr)_minmax(5.5rem,6.5rem)_5.5rem_6rem]"

/**
 * Each swim row sits on its parent's columns through subgrid, so every cell
 * lines up down the table. Phones get two lines per swim: event and time, then
 * meet and date.
 */
export const swimRowClass =
  "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-md px-2.5 py-1 transition-colors md:col-span-full md:grid-cols-subgrid md:gap-x-2 md:px-0"
const swimCellClass = "min-w-0 truncate text-sm transition-colors group-hover:text-primary md:pl-2.5"
export const swimLeadCellClass = `${swimCellClass} font-semibold text-foreground`
export const swimMetaCellClass = `${swimCellClass} font-medium text-foreground-secondary max-md:row-start-2 max-md:text-xs`
export const swimTimeCellClass =
  "font-mono text-sm font-medium tabular-nums transition-colors group-hover:text-primary max-md:col-start-2 max-md:row-start-1 text-right"
export const swimCutCellClass =
  "min-w-0 truncate pr-2.5 text-right font-mono text-sm font-medium tabular-nums text-foreground-secondary transition-colors group-hover:text-primary max-md:hidden"

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
      <span className="pr-2.5 text-right">STANDARD</span>
    </div>
  )
}

/** Qualifiers by athlete in the list layout: one row per athlete, a line per cut. */
export default function QualifiersList({
  qualifiers,
  currentAthleteId,
}: {
  qualifiers: QualifierAthlete[]
  currentAthleteId: string | null
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <QualifierListHeader cols={QUALIFIER_LIST_COLS} first="ATHLETE" second="EVENT" />
      <div className="divide-y divide-border">
        {qualifiers.map((athlete) => {
          const isMe = athlete.athleteId === currentAthleteId
          const athleteHref = athletePath(athlete.athleteSlug ?? athlete.athleteId)
          const name = athletePreferredName(athlete)
          const cuts = `${athlete.events.length} ${athlete.events.length === 1 ? "cut" : "cuts"}`
          return (
            <article
              key={athlete.athleteId}
              className={`grid gap-2 px-3 py-2 transition-colors sm:px-5 ${QUALIFIER_LIST_COLS} ${
                isMe ? "bg-primary-bg/60" : "hover:bg-background-hover"
              }`}
            >
              <div className="flex items-center gap-2.5 self-start max-md:px-2.5">
                <Link
                  href={athleteHref}
                  aria-label={`View ${name}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-text"
                >
                  {athletePreferredInitials(athlete)}
                </Link>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Link
                      href={athleteHref}
                      className="truncate text-sm font-semibold text-foreground transition-colors hover:text-primary hover:underline"
                    >
                      {name}
                    </Link>
                    {isMe ? (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-4 text-primary-text">
                        You
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-nowrap text-xs text-foreground-secondary">
                    {athlete.gender === "F" ? "Women" : "Men"} · {cuts}
                  </p>
                </div>
              </div>

              <div className="grid min-w-0 content-start gap-y-0.5 md:col-span-5 md:grid-cols-subgrid">
                {athlete.events.map((event) => (
                  <QualifierSwimRow key={event.id} swim={event} className={swimRowClass}>
                    <p className={swimLeadCellClass}>{event.event}</p>
                    <p className={swimMetaCellClass}>{event.meetName || "Qualifying swim"}</p>
                    <p className={`${swimMetaCellClass} max-md:text-right`}>{event.date || "—"}</p>
                    <p className={`${swimTimeCellClass} text-success`}>{event.time}</p>
                    <p className={swimCutCellClass}>{event.cut ?? "—"}</p>
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
