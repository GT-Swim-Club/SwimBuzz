"use client"

import Link from "next/link"
import { useState } from "react"
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  addUtcDays,
  buildWorkspaceHref,
  formatDayParam,
  startOfUtcWeek,
  type PracticeRailItem,
} from "./workspace-params"
import { practicePath } from "@/lib/slug"
import { getLocalDayKey } from "./PracticeCalendarLocal"

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

export default function MonthPickerPopover({
  weekStart,
  practicesByDay,
  selectedDayKey,
  tags,
  onClose,
}: {
  weekStart: Date
  practicesByDay: Record<string, PracticeRailItem[]>
  selectedDayKey?: string
  tags: string[]
  onClose: () => void
}) {
  const [viewedMonth, setViewedMonth] = useState(() => startOfUtcMonth(weekStart))
  const gridStart = startOfUtcWeek(viewedMonth)
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = addUtcDays(gridStart, i)
    return { date, inMonth: date.getUTCMonth() === viewedMonth.getUTCMonth() }
  })
  const todayKey = getLocalDayKey()

  return (
    <>
      <button
        type="button"
        aria-label="Close month picker"
        className="fixed inset-0 z-30 cursor-default"
        onClick={onClose}
      />
      <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-2xl border border-border-secondary bg-background p-3 shadow-lg">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-[15px] font-semibold text-foreground">
            {MONTH_NAMES[viewedMonth.getUTCMonth()]} {viewedMonth.getUTCFullYear()}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setViewedMonth(addUtcMonths(viewedMonth, -1))}
              aria-label="Previous month"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-secondary hover:bg-fill-secondary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewedMonth(addUtcMonths(viewedMonth, 1))}
              aria-label="Next month"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-secondary hover:bg-fill-secondary"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {WEEKDAY_NAMES.map((d) => (
            <div key={d} className="py-[3px] text-center text-[10px] font-semibold text-foreground-tertiary">
              {d[0]}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map(({ date, inMonth }) => {
            const key = formatDayParam(date)
            const dayPractices = practicesByDay[key] ?? []
            const isToday = key === todayKey
            const isSelected = key === selectedDayKey
            const hasPractice = dayPractices.length > 0
            const base = "flex aspect-square items-center justify-center rounded-full text-xs tabular-nums transition-colors"
            const textTone = isToday
              ? "text-primary-text font-semibold"
              : hasPractice && inMonth
                ? "text-foreground"
                : "text-foreground-tertiary"
            const bgTone = isToday ? "bg-primary" : isSelected ? "bg-primary/15" : ""
            const opacityTone = hasPractice ? "" : "opacity-40"

            if (!hasPractice) {
              return (
                <span
                  key={key}
                  className={`${base} ${textTone} ${bgTone} ${opacityTone} cursor-not-allowed`}
                >
                  {date.getUTCDate()}
                </span>
              )
            }

            const practice = dayPractices[0]
            return (
              <Link
                key={key}
                href={buildWorkspaceHref(practicePath(practice.slug ?? practice.id), { tags })}
                onClick={onClose}
                className={`${base} ${textTone} ${bgTone} hover:bg-fill-secondary`}
              >
                {date.getUTCDate()}
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
