"use client"

import { useLayoutEffect, useRef } from "react"
import type { RelayShareEvent } from "@swimbuzz/shared"
import { EventHeader, SummaryCard, publishedSummaryCards } from "./RelaySummary"
import { relayEyebrowClass } from "./RelayPageHeader"

/** Event columns in the image; more events wrap onto more rows. */
const MAX_COLUMNS = 6
/** Breathing room added to the widest card so names don't sit against the border. */
const EXTRA_COLUMN_PX = 24

/** Off-screen copy of the published relays for PNG export. Not shown in the page layout. */
export default function RelaysExportCapture({
  meetName,
  iconUrl,
  events,
}: {
  meetName: string
  iconUrl: string | null
  events: RelayShareEvent[]
}) {
  const columns = Math.max(1, Math.min(MAX_COLUMNS, events.length))
  const gridRef = useRef<HTMLDivElement>(null)

  // 1fr columns in a fit-content grid all size to the widest card; measure that, then pin
  // every column to it plus a little room. Set on the element (not in render) since it
  // depends on the measured layout.
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`
    const first = grid.firstElementChild
    if (!first) return
    const width = Math.ceil(first.getBoundingClientRect().width) + EXTRA_COLUMN_PX
    grid.style.gridTemplateColumns = `repeat(${columns}, ${width}px)`
  }, [events, columns])

  return (
    <div className="flex w-fit flex-col gap-6 bg-background p-8 text-foreground">
      <div className="flex items-center gap-5">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" crossOrigin="anonymous" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[42px] font-semibold leading-tight text-foreground">{meetName}</h1>
          <p className={`mt-1 ${relayEyebrowClass}`}>Relays</p>
        </div>
      </div>
      <div ref={gridRef} className="grid w-fit items-start gap-x-4 gap-y-5">
        {events.map((event) => (
          <section key={`${event.number ?? ""}-${event.name}`} className="flex min-w-0 flex-col gap-2">
            <EventHeader
              event={{ slug: event.name, name: event.name, number: event.number, pills: [], state: "cards", cards: [] }}
            />
            {publishedSummaryCards(event.relays, null).map((card) => (
              <SummaryCard key={card.key} card={card} clickable={false} />
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
