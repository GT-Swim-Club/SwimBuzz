"use client"

import Link from "next/link"
import { useEffect, useState, useSyncExternalStore } from "react"
import { formatPracticeDistance, formatZonedInstantRange } from "@swimbuzz/shared"
import { getLocalDayKey, getLocalWeekStartKey } from "./PracticeCalendarLocal"
import {
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
  WEEKDAY_NAMES,
  addUtcDays,
  buildWorkspaceHref,
  formatDayParam,
  parseWeekStart,
  startOfUtcWeek,
  type PracticeRailItem,
} from "./workspace-params"
import { practicePath } from "@/lib/slug"
import MonthPickerPopover from "./MonthPickerPopover"
import { showCardTags, type PracticeCardLabel } from "./usePracticePrefs"

function noopSubscribe() {
  return () => {}
}

function weekTitle(weekStart: Date) {
  const weekEnd = addUtcDays(weekStart, 6)
  const startMonth = weekStart.getUTCMonth()
  const endMonth = weekEnd.getUTCMonth()
  if (startMonth === endMonth) {
    return { primary: MONTH_NAMES[startMonth], secondary: String(weekStart.getUTCFullYear()) }
  }
  return {
    primary: `${MONTH_SHORT_NAMES[startMonth]} – ${MONTH_SHORT_NAMES[endMonth]}`,
    secondary: String(weekEnd.getUTCFullYear()),
  }
}

function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]" aria-hidden="true">
      <polyline points={dir === "left" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"} />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-foreground-secondary" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export default function WeekRail({
  weekParam,
  practicesByDay,
  selectedSlug,
  selectedDayKey,
  tags,
  monThuOnly,
  cardLabel,
  sidebarWidth,
  onWeekChange,
}: {
  weekParam: string
  practicesByDay: Record<string, PracticeRailItem[]>
  selectedSlug?: string
  selectedDayKey?: string
  tags: string[]
  monThuOnly: boolean
  cardLabel: PracticeCardLabel
  sidebarWidth: number
  onWeekChange: (weekKey: string) => void
}) {
  const weekStart = parseWeekStart(weekParam) ?? startOfUtcWeek(new Date())
  const weekDays = Array.from({ length: 7 }, (_, i) => addUtcDays(weekStart, i))
  const title = weekTitle(weekStart)
  const weekKey = formatDayParam(weekStart)

  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false)
  const [animate, setAnimate] = useState(false)

  // The server can't know the viewer's local date, so SSR/first paint treats
  // nothing as "today" and the client swaps in the real value on mount —
  // avoids a hydration mismatch. Same useSyncExternalStore trick as
  // useViewerTimeZone in ZonedTime.tsx / useTodayKey in RelativeDate.tsx.
  const todayKey = useSyncExternalStore(noopSubscribe, () => getLocalDayKey(), () => null)
  const localWeekKey = useSyncExternalStore(
    noopSubscribe,
    () => getLocalWeekStartKey(),
    () => null
  )

  useEffect(() => {
    // Session-persisted (survives remounts within the tab, e.g. back/forward)
    // "was this week already shown" marker, so the transition only animates
    // on a genuine week change rather than every mount — a real external
    // system (sessionStorage) being synchronized, not state derivable from
    // props/render.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const last = window.sessionStorage.getItem("swimbuzz-week-rail-key")
      if (last !== weekKey) {
        setAnimate(true)
        window.sessionStorage.setItem("swimbuzz-week-rail-key", weekKey)
      } else {
        setAnimate(false)
      }
    } catch {
      setAnimate(false)
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [weekKey])

  const isCurrentWeek = localWeekKey === weekKey

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 pl-0.5">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setMonthPopoverOpen((v) => !v)}
            aria-label="Change month"
            className="-mx-2 -my-1 flex min-w-0 items-center gap-0.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-fill-secondary"
          >
            <h2 className="min-w-0 shrink truncate text-[19px] leading-tight tracking-tight">
              <span className="font-bold text-foreground">{title.primary}</span>{" "}
              <span className="font-normal text-foreground-secondary">{title.secondary}</span>
            </h2>
            <ChevronDownIcon />
          </button>
          {monthPopoverOpen && (
            <MonthPickerPopover
              weekStart={weekStart}
              practicesByDay={practicesByDay}
              selectedDayKey={selectedDayKey}
              tags={tags}
              onPickDay={(dayKey) => {
                const pickedWeek = parseWeekStart(dayKey)
                if (pickedWeek) onWeekChange(formatDayParam(pickedWeek))
              }}
              onClose={() => setMonthPopoverOpen(false)}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onWeekChange(formatDayParam(addUtcDays(weekStart, -7)))}
            aria-label="Previous week"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-secondary bg-background text-foreground-secondary transition-colors hover:bg-fill-secondary"
          >
            <ChevronIcon dir="left" />
          </button>
          {isCurrentWeek ? (
            <span className="rounded-lg border border-primary bg-primary-bg px-3 py-[5px] text-[13px] font-medium text-primary">
              Today
            </span>
          ) : (
            <button
              type="button"
              onClick={() =>
                onWeekChange(
                  formatDayParam(
                    (localWeekKey ? parseWeekStart(localWeekKey) : null) ?? startOfUtcWeek(new Date())
                  )
                )
              }
              className="rounded-lg border border-border-secondary bg-background px-3 py-[5px] text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => onWeekChange(formatDayParam(addUtcDays(weekStart, 7)))}
            aria-label="Next week"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-secondary bg-background text-foreground-secondary transition-colors hover:bg-fill-secondary"
          >
            <ChevronIcon dir="right" />
          </button>
        </div>
      </div>

      <div
        key={weekKey}
        className={
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-border-secondary bg-background p-2 " +
          (animate ? "practices-rail-slide " : "") +
          (monThuOnly ? "practices-rail-mon-thu" : "")
        }
      >
        {weekDays.map((date) => {
          const key = formatDayParam(date)
          const dayPractices = practicesByDay[key] ?? []
          const weekday = date.getUTCDay()
          const isToday = todayKey === key
          return (
            <div key={key} data-weekday={weekday} className="practices-rail-day flex flex-1 flex-col gap-2">
              {dayPractices.length > 0 ? (
                dayPractices.map((practice) => (
                  <WeekRailRow
                    key={practice.id}
                    practice={practice}
                    weekday={WEEKDAY_NAMES[weekday]}
                    dateNumber={date.getUTCDate()}
                    isToday={isToday}
                    selected={
                      Boolean(selectedSlug) && (practice.slug ?? practice.id) === selectedSlug
                    }
                    tags={tags}
                    cardLabel={cardLabel}
                    sidebarWidth={sidebarWidth}
                  />
                ))
              ) : (
                <EmptyDayRow
                  weekday={WEEKDAY_NAMES[weekday]}
                  dateNumber={date.getUTCDate()}
                  isToday={isToday}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DateColumn({
  weekday,
  dateNumber,
  isToday,
  dimmed,
  selected,
}: {
  weekday: string
  dateNumber: number
  isToday: boolean
  dimmed: boolean
  selected: boolean
}) {
  return (
    <div className="w-10 shrink-0 text-center">
      <div
        className={
          "text-[11px] font-medium uppercase tracking-wide " +
          (selected ? "text-foreground-secondary" : "text-foreground-tertiary")
        }
      >
        {weekday}
      </div>
      {isToday ? (
        <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-[13px] font-semibold tabular-nums text-primary-text">
          {dateNumber}
        </span>
      ) : (
        <div
          className={
            "text-base font-semibold tabular-nums " +
            (dimmed ? "text-foreground-tertiary" : "text-foreground")
          }
        >
          {dateNumber}
        </div>
      )}
    </div>
  )
}

function EmptyDayRow({
  weekday,
  dateNumber,
  isToday,
}: {
  weekday: string
  dateNumber: number
  isToday: boolean
}) {
  return (
    <div className="flex flex-1 cursor-not-allowed items-center gap-3 rounded-lg border border-border-secondary px-3 py-3 opacity-50">
      <DateColumn weekday={weekday} dateNumber={dateNumber} isToday={isToday} dimmed selected={false} />
      <div className="min-w-0 flex-1 truncate text-sm font-normal text-foreground-tertiary">No practice posted</div>
    </div>
  )
}

function WeekRailRow({
  practice,
  weekday,
  dateNumber,
  isToday,
  selected,
  tags,
  cardLabel,
  sidebarWidth,
}: {
  practice: PracticeRailItem
  weekday: string
  dateNumber: number
  isToday: boolean
  selected: boolean
  tags: string[]
  cardLabel: PracticeCardLabel
  sidebarWidth: number
}) {
  const showTags = showCardTags(tags, practice.tags, cardLabel)
  return (
    <Link
      href={buildWorkspaceHref(practicePath(practice.slug ?? practice.id), { tags })}
      className={
        "flex flex-1 items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors " +
        (selected
          ? "border-primary bg-primary/5"
          : "border-border-secondary hover:bg-fill-secondary")
      }
    >
      <DateColumn weekday={weekday} dateNumber={dateNumber} isToday={isToday} dimmed={false} selected={selected} />
      <div className="min-w-0 flex-1">
        <p className="min-w-0 truncate text-sm font-medium leading-tight text-foreground">{practice.title}</p>
        {showTags ? (
          <div className="mt-0.5 flex h-[18px] flex-wrap items-center gap-1 overflow-hidden">
            {practice.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary/80 px-1.5 py-px text-[10px] text-primary-text dark:bg-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-0.5 flex h-[18px] items-center">
            <p className="text-xs text-foreground-tertiary">
              {formatZonedInstantRange(practice.startsAt, practice.endsAt, practice.timeZone).time}
            </p>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {!practice.published && (
          <span className="rounded-full bg-primary/20 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-active dark:bg-primary/30 dark:text-primary-hover">
            Draft
          </span>
        )}
        {practice.totalDistance > 0 && sidebarWidth >= 300 && (
          <span className="text-xs tabular-nums text-foreground-tertiary">
            {formatPracticeDistance(practice.totalDistance, practice.course)}
          </span>
        )}
      </div>
    </Link>
  )
}
