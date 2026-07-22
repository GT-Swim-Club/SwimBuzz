"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
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
  meetId: string | null
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
      <div className="rounded-xl border border-border-secondary border-dashed border-border-secondary px-4 py-8 text-center">
        <p className="text-sm text-foreground-tertiary">No swims logged yet.</p>
      </div>
    )
  }

  const selectClass =
    "rounded-lg border border-border-secondary px-3 py-1.5 text-sm bg-background"

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
            <span className="text-xs text-foreground-secondary">
              {filtered.length} swim{filtered.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => {
                setEventFilter(ALL)
                setCourseFilter(ALL)
              }}
              className="text-xs font-medium text-primary hover:text-primary-hover"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
      <div className="rounded-xl border border-border-secondary border-dashed border-border-secondary px-4 py-8 text-center">
        <p className="text-sm text-foreground-tertiary">
          No swims match these filters.
        </p>
      </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="divide-y border border-border-secondary rounded-xl overflow-hidden md:hidden">
            {visible.map((swim) => {
              const tags = displaySwimHistoryTags(swim.tags)
              const canDelete =
                isCoach && swim.source === "manual" && !isRelayLeadoffSwimTag(swim.tags)
              const isLinked = swim.meetId !== null

              const cardContent = (
                <>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                        {swim.event}
                      </span>
                      <span className="text-xs text-foreground-secondary group-hover:text-primary transition-colors">
                        {swim.course}
                      </span>
                      {tags ? (
                        <span className="font-mono text-xs text-foreground-secondary group-hover:text-primary transition-colors">
                          {tags}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-foreground-secondary truncate group-hover:text-primary transition-colors">
                      {swim.meet || "—"}
                    </p>
                    <p className="text-xs text-foreground-tertiary group-hover:text-primary transition-colors">
                      {formatSwimDate(swim.date)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-mono text-sm font-medium tabular-nums text-foreground group-hover:text-primary transition-colors">
                      {formatTime(swim.timeMs)}
                    </span>
                    {canDelete ? (
                      <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                        <DeleteSwimButton
                          swimId={swim.id}
                          event={swim.event}
                          course={swim.course}
                          timeLabel={formatTime(swim.timeMs)}
                          dateLabel={formatSwimDate(swim.date)}
                          meet={swim.meet || null}
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              )

              if (isLinked) {
                return (
                  <Link
                    key={swim.id}
                    href={`/meets/${swim.meetId}#swim-${swim.id}`}
                    className="group flex items-start border-border justify-between gap-3 bg-background px-4 py-3 hover:bg-fill-secondary transition-colors"
                  >
                    {cardContent}
                  </Link>
                )
              }

              return (
                <div
                  key={swim.id}
                  className="flex items-start border-border justify-between gap-3 bg-background px-4 py-3"
                >
                  {cardContent}
                </div>
              )
            })}
          </div>

          {/* Desktop: table grid */}
          <div className="hidden divide-y border border-border-secondary rounded-xl overflow-hidden md:block">
            <div
              className={`grid ${desktopGrid} px-4 py-2 gap-4 border-b border-border-secondary bg-fill-tertiary`}
            >
              <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
                Event
              </span>
              <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
                Course
              </span>
              <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide text-right">
                Time
              </span>
              <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide" />
              <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
                Meet
              </span>
              <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wide">
                Date
              </span>
              {isCoach && <span />}
            </div>

            {visible.map((swim) => {
              const isLinked = swim.meetId !== null

              const rowContent = (
                <>
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">{swim.event}</span>
                  <span className="text-foreground-secondary text-xs group-hover:text-primary transition-colors">{swim.course}</span>
                  <span className="font-mono text-right text-foreground group-hover:text-primary transition-colors">
                    {formatTime(swim.timeMs)}
                  </span>
                  <span className="font-mono text-foreground group-hover:text-primary transition-colors">
                    {displaySwimHistoryTags(swim.tags)}
                  </span>
                  <span className="text-foreground-secondary truncate text-xs group-hover:text-primary transition-colors">
                    {swim.meet || "—"}
                  </span>
                  <span className="text-foreground-secondary text-xs group-hover:text-primary transition-colors">
                    {formatSwimDate(swim.date)}
                  </span>
                  {isCoach && swim.source === "manual" && !isRelayLeadoffSwimTag(swim.tags) && (
                    <div className="flex justify-end" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
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
                </>
              )

              if (isLinked) {
                return (
                  <Link
                    key={swim.id}
                    href={`/meets/${swim.meetId}#swim-${swim.id}`}
                    className={`group grid ${desktopGrid} items-center border-border px-4 py-2 bg-background text-sm gap-4 hover:bg-fill-secondary transition-colors`}
                  >
                    {rowContent}
                  </Link>
                )
              }

              return (
                <div
                  key={swim.id}
                  className={`grid ${desktopGrid} items-center border-border px-4 py-2 bg-background text-sm gap-4`}
                >
                  {rowContent}
                </div>
              )
            })}
          </div>
        </>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full py-2.5 text-sm font-medium text-primary hover:text-primary-hover border border-border-secondary rounded-xl hover:bg-fill-secondary transition-colors"
        >
          {expanded
            ? "Show less"
            : `Show all ${filtered.length} swims (${filtered.length - INITIAL_COUNT} more)`}
        </button>
      )}
    </div>
  )
}
