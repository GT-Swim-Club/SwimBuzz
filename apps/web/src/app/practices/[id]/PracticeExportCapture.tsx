"use client"

import { formatPracticeDistance, formatZonedInstantRange, groupPracticeSetsIntoRows } from "@swimbuzz/shared"
import { FormattedText, isHtmlEmpty } from "@/components/ui/FormattedText"
import InfoIcon from "@/components/ui/InfoIcon"

type PracticeExportSet = {
  id: string
  title: string | null
  content: string
  distance: number | null
  startsNewRow?: boolean
}

/** Off-screen copy of the practice for PNG export. Not shown in the page layout. */
export default function PracticeExportCapture({
  title,
  showDraft,
  startsAt,
  endsAt,
  timeZone,
  location,
  course,
  focus,
  tags,
  sets,
  totalDistance,
}: {
  title: string
  showDraft: boolean
  startsAt: string
  endsAt: string
  timeZone: string
  location: string
  course: string
  focus: string | null
  tags: string[]
  sets: PracticeExportSet[]
  totalDistance: number
}) {
  const hasFocus = Boolean(focus && !isHtmlEmpty(focus))
  // Exports are static/shareable, so they always show the practice's own zone rather
  // than whichever viewer happens to be exporting it.
  const range = formatZonedInstantRange(startsAt, endsAt, timeZone)

  return (
    <div className="w-fit min-w-[420px] space-y-5 bg-background p-8 text-base text-foreground">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-[42px] font-semibold text-foreground">
            {title}
          </h1>
          {showDraft && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary-active shadow-sm dark:bg-primary/30 dark:text-primary-hover">
              Draft
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[19px] text-foreground-secondary">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <InfoIcon kind="calendar" className="h-[17px] w-[17px]" />
              {range.date} · {range.time} {range.abbrev}
            </span>
            {location && (
              <span className="flex items-center gap-1.5">
                <InfoIcon kind="location" className="h-[17px] w-[17px]" />
                {location}
              </span>
            )}
          </div>
          {(tags.length > 0 || totalDistance > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {totalDistance > 0 && (
                <span className="flex items-center gap-1.5">
                  <InfoIcon kind="waves" className="h-[17px] w-[17px]" />
                  {formatPracticeDistance(totalDistance, course)}
                </span>
              )}
              {tags.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <InfoIcon kind="tag" className="h-[17px] w-[17px]" />
                  {tags.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {hasFocus && focus && (
        <div className="rounded-2xl border-l-[3px] border-l-primary bg-background px-5 py-4 text-foreground">
          <FormattedText text={focus} className="text-base text-foreground" />
        </div>
      )}
      <section className="rounded-2xl border border-border bg-background px-6 py-5 shadow-sm">
        <div>
          {groupPracticeSetsIntoRows(sets).map((row) => (
            <div
              key={row[0].id}
              className={
                "first:pt-0 last:pb-0 py-2 " + (row.length > 1 ? "grid gap-10" : "")
              }
              style={
                row.length > 1
                  ? { gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }
                  : undefined
              }
            >
              {row.map((set) => (
                <section key={set.id}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="min-w-0 font-bold text-primary-active dark:text-primary-hover">
                      {set.title || "Set"}
                    </h3>
                    {set.distance != null && (
                      <span className="shrink-0 text-xs font-medium text-primary-active dark:text-primary-hover">
                        {set.distance}
                      </span>
                    )}
                  </div>
                  {!isHtmlEmpty(set.content) && (
                    <div className="mt-1">
                      <FormattedText text={set.content} className="text-base" />
                    </div>
                  )}
                </section>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
