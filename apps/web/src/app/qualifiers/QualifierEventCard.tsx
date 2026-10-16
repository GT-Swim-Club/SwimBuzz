"use client"

import { useState } from "react"
import { athletePreferredName } from "@swimbuzz/shared"
import type { QualifierEventGroup } from "@/lib/qualifiers/qualifier-events"
import { QualifierSwimRow, SwimDetailPanel } from "./QualifierSwimRow"
import { galleryCardClass, galleryRowClass, moreButtonClass } from "./QualifierGalleryCard"
import { eventGroupTitle, qualifierCountLabel } from "./QualifierEventList"

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
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-[15px] font-semibold leading-5 text-foreground">
          {eventGroupTitle(group, splitGender)}
        </h3>
        <p className="shrink-0 whitespace-nowrap text-right text-xs text-foreground-secondary">
          {group.cut} · {qualifierCountLabel(group.swims.length)}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {swims.map(({ athlete, swim }) => {
          const name = athletePreferredName(athlete)
          return (
            <QualifierSwimRow
              key={swim.id}
              swim={swim}
              highlight={athlete.athleteId === currentAthleteId}
              className={galleryRowClass}
              ariaLabel={`${name}, ${swim.time}, ${swim.meetName || "qualifying swim"}, ${swim.date || "date unavailable"}`}
            >
              <span className="min-w-0 truncate text-sm font-medium text-foreground-secondary transition-colors group-hover:text-primary">
                {name}
              </span>
              <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground transition-colors group-hover:text-primary">
                {swim.time}
              </span>
              <SwimDetailPanel
                details={[
                  ["Athlete", name],
                  ["Meet", swim.meetName || "—"],
                  ["Date", swim.date || "—"],
                  ["Time", swim.time || "—"],
                  ["Standard", swim.cut || "—"],
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
