"use client"

import { useMemo, type CSSProperties } from "react"
import { formatTime } from "@/lib/utils"
import {
  compareSwimEvents,
  parseEventParts,
  STROKE_LABELS,
} from "@/lib/swim/swim-parse"
import type { AthleteSwim } from "@/lib/athlete/swim-history"

type Selected = { event: string; course: string } | null

/** Best time per event in one course, grouped by stroke, with a switch over the courses swum. */
export default function PersonalBestsSidebar({
  swims,
  courses,
  course,
  onCourseChange,
  selected,
  onSelectEvent,
}: {
  swims: AthleteSwim[]
  /** Courses the athlete has swims in, in switch order. */
  courses: readonly string[]
  course: string
  onCourseChange: (course: string) => void
  selected: Selected
  onSelectEvent: (event: string) => void
}) {
  const strokeGroups = useMemo(() => {
    const best = new Map<string, number>()
    for (const s of swims) {
      if (s.course !== course) continue
      const prev = best.get(s.event)
      if (prev == null || s.timeMs < prev) best.set(s.event, s.timeMs)
    }
    const events = [...best.keys()].sort(compareSwimEvents)
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
        events: g.events.map((event) => ({ event, timeMs: best.get(event)! })),
      }))
  }, [swims, course])

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
                {group.events.map(({ event, timeMs }) => {
                  const on = selected?.event === event && selected.course === course
                  return (
                    <button
                      key={event}
                      type="button"
                      onClick={() => onSelectEvent(event)}
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
