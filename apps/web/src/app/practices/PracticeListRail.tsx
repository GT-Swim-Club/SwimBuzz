"use client"

import Link from "next/link"
import { useMemo } from "react"
import { WEEKDAY_NAMES, buildWorkspaceHref, type PracticeRailItem } from "./workspace-params"
import { practicePath } from "@/lib/slug"
import type { PracticeListSort } from "./usePracticePrefs"

function sortPractices(practices: PracticeRailItem[], sort: PracticeListSort) {
  const sorted = [...practices]
  switch (sort) {
    case "date-asc":
      sorted.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      break
    case "yards-desc":
      sorted.sort((a, b) => b.totalDistance - a.totalDistance)
      break
    case "yards-asc":
      sorted.sort((a, b) => a.totalDistance - b.totalDistance)
      break
    case "date-desc":
    default:
      sorted.sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      break
  }
  return sorted
}

function dayParts(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return { weekday: WEEKDAY_NAMES[date.getUTCDay()], dateNumber: date.getUTCDate() }
}

export default function PracticeListRail({
  practices,
  selectedSlug,
  sort,
  tags,
  emptyMessage,
}: {
  practices: PracticeRailItem[]
  selectedSlug?: string
  sort: PracticeListSort
  tags: string[]
  emptyMessage: string
}) {
  const sorted = useMemo(() => sortPractices(practices, sort), [practices, sort])

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border-secondary bg-background px-3 py-8 text-center text-[13px] text-foreground-secondary">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-xl border border-border-secondary bg-background p-2">
      {sorted.map((practice) => {
        const selected = Boolean(selectedSlug) && (practice.slug ?? practice.id) === selectedSlug
        const { weekday, dateNumber } = dayParts(practice.dayKey)
        return (
          <Link
            key={practice.id}
            href={buildWorkspaceHref(practicePath(practice.slug ?? practice.id), { tags })}
            className={
              "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors " +
              (selected ? "border-primary bg-primary/5" : "border-border-secondary hover:bg-fill-secondary")
            }
          >
            <div className="w-10 shrink-0 text-center">
              <div className="text-[11px] font-medium uppercase tracking-wide text-foreground-tertiary">
                {weekday}
              </div>
              <div className="text-base font-semibold tabular-nums text-foreground">{dateNumber}</div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="min-w-0 truncate text-sm font-medium text-foreground">{practice.title}</p>
              {practice.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {practice.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/80 px-1.5 py-px text-[10px] text-primary-text dark:bg-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {!practice.published && (
              <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-active dark:bg-primary/30 dark:text-primary-hover">
                Draft
              </span>
            )}
            {practice.totalDistance > 0 && (
              <span className="shrink-0 text-xs tabular-nums text-foreground-tertiary">
                {practice.totalDistance.toLocaleString()}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
