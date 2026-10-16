"use client"

import { useState } from "react"
import Link from "next/link"
import { athletePreferredInitials, athletePreferredName } from "@swimbuzz/shared"
import type { QualifierAthlete } from "@/lib/qualifiers/nationals-qualifiers"
import { athletePath } from "@/lib/slug"
import { QualifierSwimRow, SwimDetailPanel } from "./QualifierSwimRow"

const VISIBLE_EVENTS = 3

export const galleryCardClass =
  "flex h-full flex-col rounded-xl border border-border p-4 shadow-sm transition-shadow hover:shadow-md"
export const galleryRowClass = "group relative -mx-1 flex justify-between gap-3 rounded px-1 py-0.5 transition-colors"
export const moreButtonClass = "w-full pt-1 text-center text-xs text-primary hover:underline"

/** Qualifiers by athlete in the gallery layout: the athlete, then their cuts (first three, expandable). */
export default function QualifierGalleryCard({ athlete, isMe }: { athlete: QualifierAthlete; isMe: boolean }) {
  const [showAll, setShowAll] = useState(false)
  const events = showAll ? athlete.events : athlete.events.slice(0, VISIBLE_EVENTS)
  const cuts = `${athlete.events.length} ${athlete.events.length === 1 ? "cut" : "cuts"}`

  return (
    <div
      className={`${galleryCardClass} ${
        isMe ? "bg-[color-mix(in_srgb,var(--brand-color-primary-bg)_60%,var(--brand-color-bg-container))]" : "bg-background"
      }`}
    >
      <Link
        href={athletePath(athlete.athleteSlug ?? athlete.athleteId)}
        className="group flex min-w-0 items-center gap-2.5 text-foreground"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-sm font-semibold text-primary">
          {athletePreferredInitials(athlete)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium leading-5 transition-colors group-hover:text-primary">
            {athletePreferredName(athlete)}
          </h3>
          <p className="mt-0.5 truncate text-xs text-foreground-secondary">
            {athlete.gender === "F" ? "Women" : "Men"} · {cuts}
          </p>
        </div>
      </Link>

      <div className="mt-3 flex flex-col gap-1">
        {events.map((event) => (
          <QualifierSwimRow
            key={event.id}
            swim={event}
            className={galleryRowClass}
            ariaLabel={`${event.event}, ${event.time}, ${event.meetName || "qualifying swim"}, ${event.date || "date unavailable"}${event.cut ? `, standard ${event.cut}` : ""}`}
          >
            <span className="min-w-0 truncate text-sm font-medium text-foreground-secondary transition-colors group-hover:text-primary">
              {event.event}
            </span>
            <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground transition-colors group-hover:text-primary">
              {event.time}
            </span>
            <SwimDetailPanel
              details={[
                ["Event", event.event],
                ["Meet", event.meetName || "—"],
                ["Date", event.date || "—"],
                ["Time", event.time || "—"],
                ["Standard", event.cut || "—"],
              ]}
            />
          </QualifierSwimRow>
        ))}
        {athlete.events.length > VISIBLE_EVENTS ? (
          <button type="button" onClick={() => setShowAll(!showAll)} className={moreButtonClass}>
            {showAll ? "Show less" : `+${athlete.events.length - VISIBLE_EVENTS} more`}
          </button>
        ) : null}
      </div>
    </div>
  )
}
