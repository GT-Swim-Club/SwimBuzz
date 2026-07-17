"use client"

import { useMemo, useState } from "react"
import { formatTime, formatSwimDate } from "@/lib/utils"
import { compareSwimEvents, COURSE_LABELS } from "@/lib/swim-parse"
import { displaySwimHistoryTags } from "@/lib/swim-tags"
import { isRelayLeadoffSwimTag } from "@/lib/relay-results"
import DeleteSwimButton from "./DeleteSwimButton"

const INITIAL_COUNT = 10
const ALL = "all"

export type SwimHistoryRow = {
  id: string
  event: string
  course: string
  timeMs: number
  tags: string
  meet: string
  date: string
  source: string
}

export default function SwimHistory({
  swims,
  isCoach,
}: {
  swims: SwimHistoryRow[]
  isCoach: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [eventFilter, setEventFilter] = useState<string>(ALL)
  const [courseFilter, setCourseFilter] = useState<string>(ALL)

  const eventOptions = useMemo(
    () => Array.from(new Set(swims.map((s) => s.event))).sort(compareSwimEvents),
    [swims]
  )
  const courseOptions = useMemo(() => {
    const present = new Set(swims.map((s) => s.course))
    return COURSE_LABELS.filter((c) => present.has(c))
  }, [swims])

  const filtered = useMemo(
    () =>
      swims.filter(
        (s) =>
          (eventFilter === ALL || s.event === eventFilter) &&
          (courseFilter === ALL || s.course === courseFilter)
      ),
    [swims, eventFilter, courseFilter]
  )

  const hasMore = filtered.length > INITIAL_COUNT
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_COUNT)

  if (swims.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-800 px-4 py-8 text-center">
        <p className="text-sm text-gray-400 dark:text-zinc-500">No swims logged yet.</p>
      </div>
    )
  }

  const selectClass =
    "rounded-lg border px-3 py-1.5 text-sm dark:bg-zinc-950 dark:border-zinc-700"

  const desktopGrid = isCoach
    ? "grid-cols-[75px_20px_90px_20px_minmax(0,1fr)_80px_auto]"
    : "grid-cols-[75px_20px_90px_20px_minmax(0,1fr)_100px]"

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={eventFilter}
          onChange={(e) => {
            setEventFilter(e.target.value)
            setExpanded(false)
          }}
          className={selectClass}
          aria-label="Filter by event"
        >
          <option value={ALL}>All events</option>
          {eventOptions.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>

        <select
          value={courseFilter}
          onChange={(e) => {
            setCourseFilter(e.target.value)
            setExpanded(false)
          }}
          className={selectClass}
          aria-label="Filter by course"
        >
          <option value={ALL}>All courses</option>
          {courseOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {(eventFilter !== ALL || courseFilter !== ALL) && (
          <>
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              {filtered.length} swim{filtered.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => {
                setEventFilter(ALL)
                setCourseFilter(ALL)
              }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-zinc-800 px-4 py-8 text-center">
          <p className="text-sm text-gray-400 dark:text-zinc-500">
            No swims match these filters.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="divide-y border rounded-xl overflow-hidden md:hidden">
            {visible.map((swim) => {
              const tags = displaySwimHistoryTags(swim.tags)
              const canDelete =
                isCoach && swim.source === "manual" && !isRelayLeadoffSwimTag(swim.tags)
              return (
                <div
                  key={swim.id}
                  className="flex items-start justify-between gap-3 bg-white px-4 py-3 dark:bg-zinc-900"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium text-sm text-gray-900 dark:text-zinc-100">
                        {swim.event}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-zinc-400">
                        {swim.course}
                      </span>
                      {tags ? (
                        <span className="font-mono text-xs text-gray-500 dark:text-zinc-400">
                          {tags}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                      {swim.meet || "—"}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                      {formatSwimDate(swim.date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-mono text-sm font-medium tabular-nums text-gray-900 dark:text-zinc-100">
                      {formatTime(swim.timeMs)}
                    </span>
                    {canDelete ? (
                      <DeleteSwimButton
                        swimId={swim.id}
                        event={swim.event}
                        course={swim.course}
                        timeLabel={formatTime(swim.timeMs)}
                        dateLabel={formatSwimDate(swim.date)}
                        meet={swim.meet || null}
                      />
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: table grid */}
          <div className="hidden divide-y border rounded-xl overflow-hidden md:block">
            <div
              className={`grid ${desktopGrid} px-4 py-2 gap-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-950/50`}
            >
              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                Event
              </span>
              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                Course
              </span>
              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide text-right">
                Time
              </span>
              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide" />
              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                Meet
              </span>
              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">
                Date
              </span>
              {isCoach && <span />}
            </div>

            {visible.map((swim) => (
              <div
                key={swim.id}
                className={`grid ${desktopGrid} items-center px-4 py-2 bg-white dark:bg-zinc-900 text-sm gap-4`}
              >
                <span className="font-medium text-gray-900 dark:text-zinc-100">{swim.event}</span>
                <span className="text-gray-600 dark:text-zinc-400 text-xs">{swim.course}</span>
                <span className="font-mono text-right text-gray-900 dark:text-zinc-100">
                  {formatTime(swim.timeMs)}
                </span>
                <span className="font-mono text-gray-900 dark:text-zinc-100">
                  {displaySwimHistoryTags(swim.tags)}
                </span>
                <span className="text-gray-600 dark:text-zinc-400 truncate text-xs">
                  {swim.meet || "—"}
                </span>
                <span className="text-gray-600 dark:text-zinc-400 text-xs">
                  {formatSwimDate(swim.date)}
                </span>
                {isCoach && swim.source === "manual" && !isRelayLeadoffSwimTag(swim.tags) && (
                  <div className="flex justify-end">
                    <DeleteSwimButton
                      swimId={swim.id}
                      event={swim.event}
                      course={swim.course}
                      timeLabel={formatTime(swim.timeMs)}
                      dateLabel={formatSwimDate(swim.date)}
                      meet={swim.meet || null}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full py-2.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 border rounded-xl hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors"
        >
          {expanded
            ? "Show less"
            : `Show all ${filtered.length} swims (${filtered.length - INITIAL_COUNT} more)`}
        </button>
      )}
    </div>
  )
}
