import { athletePreferredName } from "@swimbuzz/shared"
import { EventBadge } from "@/components/meet/EventBadge"
import { eventGroupTitle, qualifierCountLabel, type QualifierEventGroup } from "@/lib/qualifiers/qualifier-events"
import { QualifierSwimRow } from "./QualifierSwimRow"
import {
  EVENT_LIST_COLS,
  QualifierSectionHeader,
  SwimCells,
  swimLeadCellClass,
  qualifierListClass,
  qualifierSectionClass,
  swimRowClass,
} from "./QualifiersList"
import { youPillClass } from "./qualifier-styles"

/** Qualifiers by event in the list layout: a header row per event, a row per swim (fastest first). */
export default function QualifierEventList({
  groups,
  splitGender,
  currentAthleteId,
}: {
  groups: QualifierEventGroup[]
  splitGender: boolean
  currentAthleteId: string | null
}) {
  return (
    <div className={qualifierListClass}>
      {groups.map((group) => (
        <section key={group.key} className={qualifierSectionClass}>
          <QualifierSectionHeader meta={`${group.cut} · ${qualifierCountLabel(group.swims.length)}`}>
            {group.eventNumber ? <EventBadge number={group.eventNumber} compact={false} /> : null}
            <span className="truncate text-base font-semibold text-foreground">{eventGroupTitle(group, splitGender)}</span>
          </QualifierSectionHeader>
          <div>
            {group.swims.map(({ athlete, swim }) => {
              const isMe = athlete.athleteId === currentAthleteId
              return (
                <QualifierSwimRow
                  key={swim.id}
                  swim={swim}
                  className={swimRowClass(EVENT_LIST_COLS)}
                >
                  <span className={`flex items-center gap-2 ${swimLeadCellClass}`}>
                    <span className="truncate">{athletePreferredName(athlete)}</span>
                    {isMe ? <span className={youPillClass}>You</span> : null}
                  </span>
                  <SwimCells swim={swim} />
                </QualifierSwimRow>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
