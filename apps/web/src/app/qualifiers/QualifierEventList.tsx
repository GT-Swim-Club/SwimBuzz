import { athletePreferredName } from "@swimbuzz/shared"
import type { QualifierEventGroup } from "@/lib/qualifiers/qualifier-events"
import { QualifierSwimRow } from "./QualifierSwimRow"
import { EVENT_LIST_COLS, QualifierListHeader, SwimCells, swimLeadCellClass, swimRowClass } from "./QualifiersList"
import { youPillClass } from "./qualifier-styles"

export function eventGroupTitle(group: QualifierEventGroup, splitGender: boolean) {
  return splitGender ? `${group.gender === "F" ? "Women" : "Men"} ${group.event}` : group.event
}

export function qualifierCountLabel(count: number) {
  return `${count} qualifier${count === 1 ? "" : "s"}`
}

/** Qualifiers by event in the list layout: one row per event, a line per swim (fastest first). */
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
    <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <QualifierListHeader cols={EVENT_LIST_COLS} first="EVENT" second="ATHLETE" />
      <div className="divide-y divide-border">
        {groups.map((group) => (
          <article key={group.key} className={`grid gap-2 px-3 py-2.5 sm:px-5 ${EVENT_LIST_COLS}`}>
            <div className="min-w-0 pt-0.5 max-md:px-2.5">
              <p className="text-base font-semibold text-foreground">{eventGroupTitle(group, splitGender)}</p>
              <p className="mt-0.5 text-[13px] text-foreground-secondary">
                Cut {group.cut} · {qualifierCountLabel(group.swims.length)}
              </p>
            </div>

            <div className="grid min-w-0 content-start gap-y-0.5 md:col-span-6 md:grid-cols-subgrid">
              {group.swims.map(({ athlete, swim }) => {
                const isMe = athlete.athleteId === currentAthleteId
                return (
                  <QualifierSwimRow key={swim.id} swim={swim} highlight={isMe} className={swimRowClass}>
                    <span className={`flex items-center gap-2 ${swimLeadCellClass}`}>
                      <span className="truncate">{athletePreferredName(athlete)}</span>
                      {isMe ? <span className={youPillClass}>You</span> : null}
                    </span>
                    <SwimCells swim={swim} />
                  </QualifierSwimRow>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
