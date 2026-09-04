"use client"

import { useState } from "react"
import Link from "next/link"
import HoverDetail from "@/components/ui/HoverDetail"
import { athletePreferredInitials, athletePreferredName } from "@swimbuzz/shared"
import type { QualifierAthlete } from "@/lib/qualifiers/nationals-qualifiers"
import { athletePath, meetSwimPath } from "@/lib/slug"

type QualifyingEvent = QualifierAthlete["events"][number]

function SwimDetailPanel({ event }: { event: QualifyingEvent }) {
  const details = [
    ["Event", event.event],
    ["Meet", event.meetName || "—"],
    ["Date", event.date || "—"],
    ["Time", event.time || "—"],
    ["Standard", event.cut || "—"],
  ]

  return (
    <HoverDetail
      belowClassName="top-full mt-2"
      aboveClassName="bottom-full mb-2"
      offset={8}
      revealClassName="md:group-hover:visible md:group-hover:opacity-100 md:group-hover:delay-300 md:group-focus-visible:visible md:group-focus-visible:opacity-100"
      className="w-64 max-w-[calc(100vw-2rem)] whitespace-normal rounded-lg p-2.5 text-left shadow-xl"
    >
      <span className="block space-y-1.5 text-xs">
        {details.map(([label, value]) => (
          <span key={label} className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-foreground-tertiary">{label}</span>
            <span className="min-w-0 truncate text-right font-medium text-foreground">{value}</span>
          </span>
        ))}
      </span>
    </HoverDetail>
  )
}

export default function QualifierGalleryCard({
  athlete,
  currentUserAthleteId,
}: {
  athlete: QualifierAthlete
  currentUserAthleteId?: string | null
}) {
  const [showAll, setShowAll] = useState(false)
  const events = showAll ? athlete.events : athlete.events.slice(0, 3)
  const isMe = athlete.athleteId === currentUserAthleteId

  return (
    <div
      className={`relative flex h-full flex-col overflow-visible rounded-xl border border-border bg-background p-4 text-center shadow-sm transition-all hover:shadow-md ${
        isMe ? "bg-amber-50" : ""
      }`}
    >
      <Link
        href={athletePath(athlete.athleteSlug ?? athlete.athleteId)}
        className="group flex flex-col items-center"
      >
        <div className="mb-3 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-primary/20 text-lg font-semibold text-primary transition-colors">
          {athletePreferredInitials(athlete)}
        </div>
        <h3 className="text-base font-medium text-foreground transition-colors group-hover:text-primary">
          {athletePreferredName(athlete)}
        </h3>
      </Link>

      <div className="mt-3 w-full space-y-1 text-left">
        {events.map((event) => {
          const content = (
            <>
              <div className="flex justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-sm font-medium text-foreground-secondary transition-colors group-hover:text-primary">
                  {event.event}
                </span>
                <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground transition-colors group-hover:text-primary">
                  {event.time}
                </span>
              </div>
              <SwimDetailPanel event={event} />
            </>
          )
          const rowClass = "group relative block rounded -mx-1 px-1 py-0.5 transition-colors hover:bg-primary-bg/70"
          const ariaLabel = `${event.event}, ${event.time}, ${event.meetName || "qualifying swim"}, ${event.date || "date unavailable"}${event.cut ? `, standard ${event.cut}` : ""}`

          if (event.meetId) {
            return (
              <Link
                key={`${event.event}-${event.id}`}
                href={event.meetSlug ? meetSwimPath(event.meetSlug, event.id) : `/meets/${event.meetId}#swim-${event.id}`}
                aria-label={ariaLabel}
                className={rowClass}
              >
                {content}
              </Link>
            )
          }

          return (
            <div key={`${event.event}-${event.id}`} className={rowClass}>
              {content}
            </div>
          )
        })}
        {athlete.events.length > 3 ? (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="w-full pt-1 text-center text-xs text-primary hover:underline"
          >
            {showAll ? "Show less" : `+${athlete.events.length - 3} more`}
          </button>
        ) : null}
      </div>
    </div>
  )
}
