"use client"

import { useLayoutEffect, useRef } from "react"
import { relayShareRows, type MeetHeaderDetails, type RelayShareEvent } from "@swimbuzz/shared"
import MeetExportHeader from "@/components/meet/MeetExportHeader"
import { EventHeader, SummaryCard, publishedSummaryCards } from "./RelaySummary"

/** Breathing room added to the widest card so names don't sit against the border. */
const EXTRA_COLUMN_PX = 24

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

  return (
    <div className="flex w-fit flex-col gap-6 bg-background p-8 text-foreground">
      <MeetExportHeader eyebrow="Relays" meetName={meetName} details={details} iconUrl={iconUrl} />
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
