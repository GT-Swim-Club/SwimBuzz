"use client"

import { useState } from "react"
import { athletePreferredName } from "@swimbuzz/shared"
import { EventBadge } from "@/components/meet/EventBadge"
import {
  eventGroupTitle,
  qualifierCountLabel,
  qualifierMarginLabel,
  type QualifierEventGroup,
} from "@/lib/qualifiers/qualifier-events"
import { GallerySwimTime, QualifierSwimRow, SwimDetailPanel } from "./QualifierSwimRow"
import { galleryCardClass, galleryRowClass, moreButtonClass } from "./QualifierGalleryCard"

const VISIBLE_SWIMS = 4

/** Qualifiers by event in the gallery layout: the event, then its fastest qualifiers (expandable). */
export default function QualifierEventCard({
  group,
  splitGender,
  currentAthleteId,
}: {
  group: QualifierEventGroup
  splitGender: boolean
  currentAthleteId: string | null
}) {
  const [showAll, setShowAll] = useState(false)
  const swims = showAll ? group.swims : group.swims.slice(0, VISIBLE_SWIMS)

  return (
    <div className={`${galleryCardClass} bg-background`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {group.eventNumber ? <EventBadge number={group.eventNumber} /> : null}
          <h3 className="min-w-0 truncate text-[15px] font-semibold leading-5 text-foreground">
            {eventGroupTitle(group, splitGender)}
          </h3>
        </div>
        <p className="shrink-0 whitespace-nowrap text-right text-xs text-foreground-secondary">
          {group.cut} · {qualifierCountLabel(group.swims.length)}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {swims.map(({ athlete, swim }) => {
          const name = athletePreferredName(athlete)
          const isMe = athlete.athleteId === currentAthleteId
          return (
            <QualifierSwimRow
              key={swim.id}
              swim={swim}
              highlight={isMe}
              className={galleryRowClass}
              ariaLabel={`${name}${isMe ? " (you)" : ""}, ${swim.time}, margin ${qualifierMarginLabel(swim)}, ${swim.meetName || "qualifying swim"}, ${swim.date || "date unavailable"}`}
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground-secondary">
                {name}
              </span>
              <GallerySwimTime swim={swim} />
              <SwimDetailPanel
                details={[
                  ["Athlete", name],
                  ["Meet", swim.meetName || "—"],
                  ["Date", swim.date || "—"],
                  ["Time", swim.time || "—"],
                  ["Standard", swim.cut || "—"],
                  ["Margin", qualifierMarginLabel(swim)],
                ]}
              />
            </QualifierSwimRow>
          )
        })}
        {group.swims.length > VISIBLE_SWIMS ? (
          <button type="button" onClick={() => setShowAll(!showAll)} className={moreButtonClass}>
            {showAll ? "Show less" : `+${group.swims.length - VISIBLE_SWIMS} more`}
          </button>
        ) : null}
      </div>
    </div>
  )
}
