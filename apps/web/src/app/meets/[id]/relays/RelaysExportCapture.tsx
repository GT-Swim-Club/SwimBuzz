"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { MEET_HEADER, relayShareRows, type MeetHeaderDetails, type RelayShareEvent } from "@swimbuzz/shared"
import InfoIcon from "@/components/ui/InfoIcon"
import { EventHeader, SummaryCard, publishedSummaryCards } from "./RelaySummary"
import { relayEyebrowClass } from "./RelayPageHeader"

/** Breathing room added to the widest card so names don't sit against the border. */
const EXTRA_COLUMN_PX = 24

/** Trims a line's box to its capitals and baseline, so margins between lines are the visible gaps. */
const TRIM_TO_CAPS = "[text-box:trim-both_cap_alphabetic]"
// The header's sizes follow the meet name's, in the proportions every meet header shares.
const TITLE_PX = 38
const EYEBROW_PX = TITLE_PX * MEET_HEADER.eyebrowSize
const DETAILS_PX = TITLE_PX * MEET_HEADER.detailsSize
const ICON_OVERSHOOT_PX = TITLE_PX * MEET_HEADER.iconOvershoot
/** The meet name itself keeps the PNG's own larger size. */
const MEET_NAME_PX = 42
/** Details icons at the text size, pulled in to the text's capitals so they don't widen the gaps. */
const DETAILS_ICON_STYLE = { width: DETAILS_PX, height: DETAILS_PX, margin: `${-DETAILS_PX * 0.15}px 0` }

/** Off-screen copy of the published relays for PNG export. Not shown in the page layout. */
export default function RelaysExportCapture({
  meetName,
  details,
  iconUrl,
  events,
}: {
  meetName: string
  /** Date and location (with the school), under the meet name. */
  details: MeetHeaderDetails
  iconUrl: string | null
  events: RelayShareEvent[]
}) {
  // One row for a few events; otherwise women's row, then men's (mixed at its end), types in columns.
  const rows = relayShareRows(events)
  const columns = Math.max(1, rows[0]?.length ?? 1)
  const gridRef = useRef<HTMLDivElement>(null)

  // 1fr columns in a fit-content grid all size to the widest card; measure that, then pin
  // every column to it plus a little room. Set on the element (not in render) since it
  // depends on the measured layout.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`
    const first = grid.querySelector("section")
    if (!first) return
    const width = Math.ceil(first.getBoundingClientRect().width) + EXTRA_COLUMN_PX
    grid.style.gridTemplateColumns = `repeat(${columns}, ${width}px)`
  }, [events, columns])

  // The icon spans the header's three rows, reaching past them a little since a round logo that
  // only touches a line looks short of it. Re-measured as the fonts load and change the rows.
  const headerTextRef = useRef<HTMLDivElement>(null)
  const [iconSize, setIconSize] = useState<number | null>(null)
  useLayoutEffect(() => {
    const text = headerTextRef.current
    if (!text) return
    const measure = () => setIconSize(text.getBoundingClientRect().height + ICON_OVERSHOOT_PX * 2)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(text)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex w-fit flex-col gap-6 bg-background p-8 text-foreground">
      {/* Like the relays PDF's header: eyebrow, meet name, then date & location, each row trimmed
          to its capitals and baseline so the gaps between them are the gaps you see. */}
      <div className="flex items-start" style={{ gap: TITLE_PX * MEET_HEADER.iconGap }}>
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconUrl}
            alt=""
            crossOrigin="anonymous"
            className="h-20 w-20 shrink-0 rounded-xl object-cover"
            style={iconSize ? { width: iconSize, height: iconSize, margin: `-${ICON_OVERSHOOT_PX}px 0` } : undefined}
          />
        ) : null}
        <div ref={headerTextRef} className="min-w-0">
          <p className={`${relayEyebrowClass} ${TRIM_TO_CAPS}`} style={{ fontSize: EYEBROW_PX }}>
            Relays
          </p>
          <h1
            className={`font-semibold leading-tight text-foreground ${TRIM_TO_CAPS}`}
            style={{ fontSize: MEET_NAME_PX, marginTop: TITLE_PX * MEET_HEADER.gapAboveTitle }}
          >
            {meetName}
          </h1>
          <div
            className="flex items-center gap-x-5 text-foreground-secondary"
            style={{ fontSize: DETAILS_PX, marginTop: TITLE_PX * MEET_HEADER.gapBelowTitle }}
          >
            <span className="flex items-center gap-1.5">
              <InfoIcon kind="calendar" style={DETAILS_ICON_STYLE} />
              <span className={TRIM_TO_CAPS}>{details.date}</span>
            </span>
            {details.location ? (
              <span className="flex items-center gap-1.5">
                <InfoIcon kind="location" style={DETAILS_ICON_STYLE} />
                <span className={TRIM_TO_CAPS}>{details.location}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div ref={gridRef} className="grid w-fit items-start gap-x-4 gap-y-5">
        {rows.flat().map((event, i) =>
          event ? (
            <section key={`${event.number ?? ""}-${event.name}`} className="flex min-w-0 flex-col gap-2">
              <EventHeader
                event={{ slug: event.name, name: event.name, number: event.number, pills: [], state: "cards", cards: [] }}
              />
              {publishedSummaryCards(event.relays, null).map((card) => (
                <SummaryCard key={card.key} card={card} clickable={false} />
              ))}
            </section>
          ) : (
            <div key={`empty-${i}`} aria-hidden />
          )
        )}
      </div>
    </div>
  )
}
