import Link from "next/link"
import type { ReactNode } from "react"
import { athletePreferredInitials, athletePreferredName } from "@swimbuzz/shared"
import type { QualifierAthlete, QualifierRow } from "@/lib/qualifiers/nationals-qualifiers"
import { qualifierMarginLabel } from "@/lib/qualifiers/qualifier-events"
import { athletePath } from "@/lib/slug"
import { QualifierSwimRow } from "./QualifierSwimRow"
import { athleteCutsLabel, meTintClass, qualifierListAvatarClass, youPillClass } from "./qualifier-styles"

/**
 * The list layout: one card with the roster summary's border, background and dividers — a header
 * row per athlete (or event), a full divider between sections and a subtle one between swims.
 */
export const qualifierListClass = "overflow-hidden rounded-xl border border-border bg-background"
/** A section: a full divider above each but the first. */
export const qualifierSectionClass = "scroll-mt-3 border-t border-border first:border-t-0"

/**
 * Event (or athlete) · Time · Margin · Standard · Meet · Date on md+, every row on the same columns,
 * the times spaced apart and the meet taking the slack, so the date column sits at the right edge.
 */
export const QUALIFIER_LIST_COLS = "md:grid-cols-[minmax(7rem,10rem)_6.5rem_6.5rem_7rem_minmax(0,1fr)_7.5rem]"
export const EVENT_LIST_COLS = "md:grid-cols-[minmax(10rem,15rem)_6.5rem_6.5rem_7rem_minmax(0,1fr)_7.5rem]"

const rowGridClass = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 max-sm:px-3 md:gap-x-2"

/**
 * A swim row on the list's columns. Phones get two lines per swim: label and time (with the
 * margin), then meet · date and the cut.
 */
export function swimRowClass(cols: string) {
  return `${rowGridClass} ${cols} border-t border-border-subtle py-2 transition-colors duration-200 first:border-t-0`
}

const cellClass = "min-w-0 truncate text-[15px]"
export const swimLeadCellClass = `${cellClass} font-medium text-foreground`
const metaCellClass = `${cellClass} text-foreground-secondary max-md:row-start-2 max-md:text-[13px]`

/** A swim's cells after its label: time, margin under the cut, the standard, meet and date. */
export function SwimCells({ swim }: { swim: QualifierRow }) {
  const margin = qualifierMarginLabel(swim)
  return (
    <>
      <span className="whitespace-nowrap font-mono text-[15px] font-semibold tabular-nums text-foreground text-right max-md:col-start-2 max-md:row-start-1">
        {swim.time}
        <span className="ml-1.5 text-[13px] font-medium text-success-text md:hidden">{margin}</span>
      </span>
      <span className="whitespace-nowrap text-right font-mono text-[15px] font-medium tabular-nums text-success-text max-md:hidden">
        {margin}
      </span>
      <span className="min-w-0 truncate font-mono text-[15px] font-medium tabular-nums text-foreground-secondary text-right max-md:col-start-2 max-md:row-start-2 max-md:text-[13px]">
        <span className="md:hidden">cut </span>
        {swim.cut || "—"}
      </span>
      <span className={`${metaCellClass} max-md:col-start-1 md:pl-12`}>
        {swim.meetName || "Qualifying swim"}
        {swim.date ? <span className="md:hidden"> · {swim.date}</span> : null}
      </span>
      <span className={`${metaCellClass} max-md:hidden`}>{swim.date || "—"}</span>
    </>
  )
}

/** A section's header row: avatar and name (or the event) on the left, its meta on the right. */
const sectionHeaderClass = "flex min-h-12 items-center gap-2.5 px-4 py-2 max-sm:px-3"

export function QualifierSectionHeader({
  href,
  meta,
  children,
}: {
  href?: string
  meta: string
  children: ReactNode
}) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">{children}</span>
      <span className="shrink-0 whitespace-nowrap text-[13px] text-foreground-secondary">{meta}</span>
    </>
  )
  return href ? (
    <Link
      href={href}
      className={`${sectionHeaderClass} transition-colors duration-200 hover:bg-[var(--qualifier-row-hover,var(--brand-color-bg-hover))]`}
    >
      {content}
    </Link>
  ) : (
    <div className={sectionHeaderClass}>{content}</div>
  )
}

/** Qualifiers by athlete in the list layout: a header row per athlete, a row per cut. */
export default function QualifiersList({
  qualifiers,
  currentAthleteId,
  showGender,
  anchorIds,
}: {
  qualifiers: QualifierAthlete[]
  currentAthleteId: string | null
  showGender: boolean
  /** The A–Z rail's targets: an athlete id → the element id to give their section. */
  anchorIds: Map<string, string>
}) {
  return (
    <div className={qualifierListClass}>
      {qualifiers.map((athlete) => {
        const isMe = athlete.athleteId === currentAthleteId
        return (
          <section
            key={athlete.athleteId}
            id={anchorIds.get(athlete.athleteId)}
            className={`${qualifierSectionClass} ${isMe ? meTintClass : ""}`}
          >
            <QualifierSectionHeader
              href={athletePath(athlete.athleteSlug ?? athlete.athleteId)}
              meta={athleteCutsLabel(athlete.gender, athlete.events.length, showGender)}
            >
              <span className={qualifierListAvatarClass}>{athletePreferredInitials(athlete)}</span>
              <span className="truncate text-base font-semibold text-foreground">{athletePreferredName(athlete)}</span>
              {isMe ? <span className={youPillClass}>You</span> : null}
            </QualifierSectionHeader>
            <div className="border-t border-border-subtle">
              {athlete.events.map((event) => (
                <QualifierSwimRow key={event.id} swim={event} className={swimRowClass(QUALIFIER_LIST_COLS)}>
                  <span className={swimLeadCellClass}>{event.event}</span>
                  <SwimCells swim={event} />
                </QualifierSwimRow>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
