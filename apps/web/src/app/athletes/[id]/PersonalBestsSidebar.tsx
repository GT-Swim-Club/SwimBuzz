"use client"

import { Fragment, useMemo, type CSSProperties } from "react"
import { formatTime } from "@/lib/utils"
import {
  compareSwimEvents,
  parseEventParts,
  STROKE_LABELS,
} from "@/lib/swim/swim-parse"
import { RELAY_SPLIT_LABEL, type AthleteSwim } from "@/lib/athlete/swim-history"

type Selected = { event: string; course: string; splits: boolean } | null

/**
 * Best time per event in one course, grouped by stroke, with a switch over the courses swum.
 * A faster relay split (or one in an event with no flat-start time) adds a row that opens the
 * event's relay splits.
 */
export default function PersonalBestsSidebar({
  swims,
  relaySplits,
  courses,
  course,
  onCourseChange,
  selected,
  onSelectEvent,
}: {
  swims: AthleteSwim[]
  relaySplits: AthleteSwim[]
  /** Courses the athlete has swims in, in switch order. */
  courses: readonly string[]
  course: string
  onCourseChange: (course: string) => void
  selected: Selected
  /** `splits` for the event's relay-split row. */
  onSelectEvent: (event: string, splits: boolean) => void
}) {
  const strokeGroups = useMemo(() => {
    const bestIn = (list: AthleteSwim[]) => {
      const best = new Map<string, number>()
      for (const s of list) {
        if (s.course !== course) continue
        const prev = best.get(s.event)
        if (prev == null || s.timeMs < prev) best.set(s.event, s.timeMs)
      }
      return best
    }
    const best = bestIn(swims)
    const bestSplit = bestIn(relaySplits)
    const events = [...new Set([...best.keys(), ...bestSplit.keys()])].sort(compareSwimEvents)
    const strokes: string[] = [...STROKE_LABELS]
    const groups = strokes.map((stroke) => ({
      stroke,
      events: events.filter((ev) => parseEventParts(ev).stroke === stroke),
    }))
    const other = events.filter((ev) => !strokes.includes(parseEventParts(ev).stroke))
    if (other.length) groups.push({ stroke: "Other", events: other })
    return groups
      .filter((g) => g.events.length > 0)
      .map((g) => ({
        ...g,
        events: g.events.map((event) => {
          const timeMs = best.get(event) ?? null
          const splitMs = bestSplit.get(event) ?? null
          return { event, timeMs, splitMs: splitMs != null && (timeMs == null || splitMs < timeMs) ? splitMs : null }
        }),
      }))
  }, [swims, relaySplits, course])

  const courseIndex = Math.max(0, courses.indexOf(course))

  return (
    <div>
      <div className="mb-1.5 flex min-h-[34px] items-center">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Personal bests
        </h2>
      </div>
      <section
        aria-label="Personal bests by event"
        className="rounded-xl border border-border-secondary bg-background pb-2.5 pt-3.5 shadow-xs"
      >
        {courses.length > 0 && (
          <div className="px-3 pb-2">
            <div
              role="group"
              aria-label="Course"
              className="relative grid h-9 rounded-lg border border-border-secondary bg-fill-secondary p-0.5"
              style={{ gridTemplateColumns: `repeat(${courses.length}, minmax(0, 1fr))` }}
            >
              <span
                aria-hidden
                className="absolute bottom-0.5 left-0.5 top-0.5 w-[calc((100%-4px)/var(--course-count))] rounded-md bg-primary-bg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand-color-primary)_25%,transparent)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
                style={{ "--course-count": courses.length, transform: `translateX(${courseIndex * 100}%)` } as CSSProperties}
              />
              {courses.map((c) => {
                const on = c === course
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onCourseChange(c)}
                    aria-pressed={on}
                    className={`relative z-[1] rounded-md text-[13px] font-medium transition-colors ${
                      on ? "text-accent" : "text-foreground-secondary hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {strokeGroups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-foreground-tertiary">
            No times recorded yet.
          </p>
        ) : (
          strokeGroups.map((group, gi) => (
            <div key={group.stroke} className="pt-[3px]">
              {gi > 0 && <span aria-hidden className="mx-3 mb-[3px] block h-px bg-border-secondary" />}
              <div role="group" aria-label={group.stroke}>
                {group.events.map(({ event, timeMs, splitMs }) => {
                  const eventOn = selected?.event === event && selected.course === course
                  // Viewing splits whose row isn't listed (slower than the flat start) marks the event's row.
                  const on = eventOn && (!selected.splits || splitMs == null)
                  const splitOn = eventOn && selected.splits
                  return (
                    <Fragment key={event}>
                      {timeMs != null && (
                        <button
                          type="button"
                          onClick={() => onSelectEvent(event, false)}
                          aria-pressed={on}
                          className={`mx-1.5 flex w-[calc(100%-12px)] items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[15px] text-foreground transition-colors ${
                            on
                              ? "border-primary bg-primary/5"
                              : "border-transparent hover:bg-background-hover"
                          }`}
                        >
                          <span className={`truncate ${on ? "font-medium" : ""}`}>{event}</span>
                          <span
                            className={`shrink-0 font-mono text-sm font-medium tabular-nums ${
                              on ? "text-foreground" : "text-foreground-secondary"
                            }`}
                          >
                            {formatTime(timeMs)}
                          </span>
                        </button>
                      )}
                      {splitMs != null && (
                        <button
                          type="button"
                          onClick={() => onSelectEvent(event, true)}
                          aria-pressed={splitOn}
                          className={`mx-1.5 flex w-[calc(100%-12px)] items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[15px] transition-colors ${
                            splitOn
                              ? "border-primary bg-primary/5"
                              : "border-transparent hover:bg-background-hover"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className={`truncate ${splitOn ? "font-medium text-foreground" : "text-foreground-secondary"}`}
                            >
                              {event}
                            </span>
                            <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              {RELAY_SPLIT_LABEL}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 font-mono text-sm font-medium tabular-nums ${
                              splitOn ? "text-foreground" : "text-foreground-secondary"
                            }`}
                          >
                            {formatTime(splitMs)}
                          </span>
                        </button>
                      )}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
