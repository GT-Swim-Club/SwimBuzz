"use client"

import { useLayoutEffect, useRef } from "react"
import {
  rosterNameFirstLast,
  rosterNamePreferred,
  rosterSummaryPngColumns,
  type MeetHeaderDetails,
  type RosterSummaryPdfRequest,
  type RosterSummaryPdfRow,
  type RosterSummaryPdfSection,
} from "@swimbuzz/shared"
import MeetExportHeader from "@/components/meet/MeetExportHeader"
import { EventBadge, SummaryRowResult } from "./SummaryRow"

/** Room between a row's name and its heat & lane, so they don't run together at content width. */
const NAME_GAP_PX = 24

/** Medley relay legs in swim order. */
const MEDLEY_STROKES = ["BK", "BR", "FL", "FR"]

function CaptureRow({ row, medley }: { row: RosterSummaryPdfRow; medley: boolean }) {
  const legs = row.legs ?? []
  const tags = medley && legs.length === MEDLEY_STROKES.length ? MEDLEY_STROKES : null
  return (
    <li className="flex items-center gap-2.5 border-t border-border-subtle py-2 text-sm leading-[1.3] first:border-t-0">
      {row.eventNumber ? <EventBadge number={row.eventNumber} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium tracking-[-0.005em]">{rosterNamePreferred(row.label)}</span>
          {row.sub ? (
            <span className="shrink-0 whitespace-nowrap text-xs text-foreground-tertiary">{row.sub}</span>
          ) : null}
        </span>
        {row.meta ? (
          <span className="truncate text-xs leading-[1.4] text-foreground-tertiary">{row.meta}</span>
        ) : null}
        {legs.length > 0 ? (
          <span className="grid grid-cols-2 gap-x-3 text-xs leading-[1.4] text-foreground-secondary">
            {legs.map((leg, i) => (
              <span key={`${i}-${leg}`} className="flex min-w-0 items-baseline gap-1.5">
                <span className="w-4 shrink-0 text-[9px] font-semibold tracking-[0.05em] text-foreground-tertiary">
                  {tags?.[i] ?? i + 1}
                </span>
                <span className="truncate">{rosterNameFirstLast(rosterNamePreferred(leg))}</span>
              </span>
            ))}
          </span>
        ) : null}
      </div>
      {row.heatLane || row.startTime ? (
        <span className="flex shrink-0 flex-col items-end text-xs leading-[1.4]" style={{ paddingLeft: NAME_GAP_PX }}>
          {row.heatLane ? <span className="text-foreground-secondary">{row.heatLane}</span> : null}
          {row.startTime ? <span className="text-foreground-tertiary">{row.startTime}</span> : null}
        </span>
      ) : null}
      {row.result?.kind === "text" ? (
        <span className="shrink-0 text-right text-xs text-foreground-secondary">{row.result.text}</span>
      ) : row.result ? (
        <SummaryRowResult result={row.result} compact={false} />
      ) : null}
    </li>
  )
}

function CaptureSection({ section }: { section: RosterSummaryPdfSection }) {
  return (
    <section className="w-full overflow-hidden rounded-xl border border-border-secondary bg-background">
      <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-foreground">
        {section.eventNumber ? <EventBadge number={section.eventNumber} /> : null}
        <span>{rosterNamePreferred(section.title)}</span>
      </div>
      <ul className="border-t border-border-subtle px-4">
        {section.rows.map((row, i) => (
          <CaptureRow
            key={i}
            row={row}
            medley={/\bmedley\b/i.test(`${section.title} ${row.label}`)}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * Off-screen copy of the roster summary for PNG export, from the same request as the PDF: the meet
 * header, then the sections in balanced columns. Not shown in the page layout.
 */
export default function RosterSummaryExportCapture({
  meetName,
  details,
  iconUrl,
  request,
}: {
  meetName: string
  details: MeetHeaderDetails
  iconUrl: string | null
  request: RosterSummaryPdfRequest
}) {
  const columns = rosterSummaryPngColumns(request.sections)
  const gridRef = useRef<HTMLDivElement>(null)

  // Columns as wide as their content: lay them out at their natural width, then pin every column
  // to the widest so they line up. Set on the element (not in render) since it depends on layout.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    grid.style.gridTemplateColumns = `repeat(${columns.length}, max-content)`
    const width = Math.max(...[...grid.children].map((column) => Math.ceil(column.getBoundingClientRect().width)))
    grid.style.gridTemplateColumns = `repeat(${columns.length}, ${width}px)`
  }, [request, columns.length])

  return (
    <div className="flex w-fit flex-col gap-6 bg-background p-8 text-foreground">
      <MeetExportHeader
        eyebrow={request.heading ?? "Entries"}
        meetName={meetName}
        details={details}
        iconUrl={iconUrl}
      />
      {columns.length === 0 ? (
        <p className="text-sm text-foreground-tertiary">No entries match these filters.</p>
      ) : (
        <div ref={gridRef} className="grid w-fit items-start gap-4">
          {columns.map((column, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-4">
              {column.map((section, j) => (
                <CaptureSection key={j} section={section} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
