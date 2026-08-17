"use client"

import { formatSwimDate } from "@/lib/utils"
import { formatClockTimeRange } from "@swimbuzz/shared"
import { FormattedText, isHtmlEmpty } from "@/components/FormattedText"
import InfoIcon from "@/components/InfoIcon"

type PracticeExportSet = {
  id: string
  title: string | null
  content: string
  distance: number | null
}

/** Off-screen copy of the practice for PNG export. Not shown in the page layout. */
export default function PracticeExportCapture({
  title,
  showDraft,
  dateIso,
  startTime,
  endTime,
  location,
  focus,
  tags,
  sets,
  totalDistance,
}: {
  title: string
  showDraft: boolean
  dateIso: string | null
  startTime: string
  endTime: string
  location: string
  focus: string | null
  tags: string[]
  sets: PracticeExportSet[]
  totalDistance: number
}) {
  const hasFocus = Boolean(focus && !isHtmlEmpty(focus))

  return (
    <div className="w-[896px] space-y-5 bg-background p-8 text-base text-foreground">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 text-4xl font-semibold text-foreground">
            {title}
          </h1>
          {showDraft && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary-active shadow-sm dark:bg-primary/30 dark:text-primary-hover">
              Draft
            </span>
          )}
        </div>
        <div className="mt-1 text-lg text-foreground-secondary">
          <div className="flex items-center gap-1.5">
            <InfoIcon kind="calendar" />
            {dateIso ? formatSwimDate(dateIso) : "No date"}
            {startTime || endTime ? ` · ${formatClockTimeRange(startTime, endTime)}` : ""}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {location && (
              <span className="flex items-center gap-1.5">
                <InfoIcon kind="location" />
                {location}
              </span>
            )}
            {location && totalDistance > 0 && <span>·</span>}
            {totalDistance > 0 && <span>{totalDistance.toLocaleString()} yards</span>}
          </div>
        </div>
      </div>
      {(hasFocus || tags.length > 0) && (
        <div className="rounded-2xl border-l-[3px] border-l-primary bg-background px-5 py-4 text-foreground">
          {hasFocus && focus && (
            <FormattedText text={focus} className="text-base text-foreground" />
          )}
          {tags.length > 0 && (
            <div className={hasFocus ? "mt-3 flex flex-wrap gap-2" : "flex flex-wrap gap-2"}>
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-primary/80 px-2 py-0.5 text-xs text-primary-text dark:bg-primary"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      <section className="rounded-2xl border border-border bg-background px-6 py-5 shadow-sm">
        <div className="space-y-2">
          {sets.map((set) => (
            <section key={set.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 font-bold text-primary-active dark:text-primary-hover">
                  {set.title || "Set"}
                </h3>
                {set.distance != null && (
                  <span className="shrink-0 text-xs font-medium text-primary-active dark:text-primary-hover">
                    {set.distance.toLocaleString()}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <FormattedText text={set.content} className="text-base" />
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
