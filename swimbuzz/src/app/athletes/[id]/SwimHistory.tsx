"use client"

import { useMemo, useState } from "react"
import { formatTime, formatSwimDate } from "@/lib/utils"
import { compareSwimEvents, COURSE_LABELS } from "@/lib/swim-parse"
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
      <div className="divide-y border rounded-xl overflow-hidden">
        <div
          className={`grid ${isCoach ? "grid-cols-[75px_20px_90px_20px_310px_80px_10px]" : "grid-cols-[75px_20px_90px_20px_1fr_100px]"} px-4 py-2 gap-4 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-950/50`}
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
            className={`grid ${isCoach ? "grid-cols-[75px_20px_90px_20px_310px_80px_10px]" : "grid-cols-[75px_20px_90px_20px_1fr_100px]"} items-center px-4 py-2 bg-white dark:bg-zinc-900 text-sm gap-4`}
          >
            <span className="font-medium text-gray-900 dark:text-zinc-100">{swim.event}</span>
            <span className="text-gray-600 dark:text-zinc-400 text-xs">{swim.course}</span>
            <span className="font-mono text-right text-gray-900 dark:text-zinc-100">
              {formatTime(swim.timeMs)}
            </span>
            <span className="font-mono text-gray-900 dark:text-zinc-100">{swim.tags}</span>
            <span className="text-gray-600 dark:text-zinc-400 truncate text-xs">
              {swim.meet || "—"}
            </span>
            <span className="text-gray-600 dark:text-zinc-400 text-xs">
              {formatSwimDate(swim.date)}
            </span>
            {isCoach && swim.source === "manual" && (
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
