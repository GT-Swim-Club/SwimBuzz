"use client"

import { useState } from "react"
import Link from "next/link"
import { athletePreferredInitials, athletePreferredName } from "@swimbuzz/shared"
import type { QualifierAthlete } from "@/lib/qualifiers/nationals-qualifiers"
import { qualifierMarginLabel } from "@/lib/qualifiers/qualifier-events"
import { athletePath } from "@/lib/slug"
import { GallerySwimTime, QualifierSwimRow, SwimDetailPanel } from "./QualifierSwimRow"
import { athleteCutsLabel, meTintClass, qualifierAvatarClass, youPillClass } from "./qualifier-styles"

const VISIBLE_EVENTS = 3

export const galleryCardClass =
  "flex h-full flex-col rounded-xl border border-border p-4 shadow-sm transition-shadow hover:shadow-md"
export const galleryRowClass = "group relative -mx-1 flex justify-between gap-3 rounded px-1 py-0.5 transition-colors"
export const moreButtonClass = "w-full pt-1 text-center text-xs font-medium text-accent hover:text-primary hover:underline"

/** Qualifiers by athlete in the gallery layout: the athlete, then their cuts (first three, expandable). */
export default function QualifierGalleryCard({
  athlete,
  isMe,
  showGender,
}: {
  athlete: QualifierAthlete
  isMe: boolean
  showGender: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const events = showAll ? athlete.events : athlete.events.slice(0, VISIBLE_EVENTS)

  return (
    <div className={`${galleryCardClass} ${isMe ? meTintClass : "bg-background"}`}>
      <Link
        href={athletePath(athlete.athleteSlug ?? athlete.athleteId)}
        className="group flex min-w-0 items-center gap-2.5 text-foreground"
      >
        <div className={`${qualifierAvatarClass} group-hover:border-primary`}>{athletePreferredInitials(athlete)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-[15px] font-medium leading-5 transition-colors group-hover:text-primary">
              {athletePreferredName(athlete)}
            </h3>
            {isMe ? <span className={youPillClass}>You</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-foreground-secondary">
            {athleteCutsLabel(athlete.gender, athlete.events.length, showGender)}
          </p>
        </div>
      </Link>

      <div className="mt-3 flex flex-col gap-1">
        {events.map((event) => (
          <QualifierSwimRow
            key={event.id}
            swim={event}
            className={galleryRowClass}
            ariaLabel={`${event.event}, ${event.time}, ${qualifierMarginLabel(event)} under the cut, ${event.meetName || "qualifying swim"}, ${event.date || "date unavailable"}${event.cut ? `, standard ${event.cut}` : ""}`}
          >
            <span className="min-w-0 truncate text-sm font-medium text-foreground-secondary transition-colors group-hover:text-primary">
              {event.event}
            </span>
            <GallerySwimTime swim={event} />
            <SwimDetailPanel
              details={[
                ["Event", event.event],
                ["Meet", event.meetName || "—"],
                ["Date", event.date || "—"],
                ["Time", event.time || "—"],
                ["Standard", event.cut || "—"],
                ["Under the cut", qualifierMarginLabel(event)],
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
