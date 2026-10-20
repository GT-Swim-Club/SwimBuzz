"use client"

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import Link from "next/link"
import { currentSeason, seasonFromDate } from "@swimbuzz/shared"
import { formatSwimDate, formatTime } from "@/lib/utils"
import {
  compareSwimsChronologically,
  compareSwimsNewestFirst,
  formatTimeDelta,
  isDeletableSwim,
  swimFlagLabel,
  swimMeetHref,
  type AthleteSwim,
  type SwimMarks,
} from "@/lib/athlete/swim-history"
import DeleteSwimButton from "./DeleteSwimButton"
import { ImprovementCell, PbBadge } from "./SwimMarks"

const DAY_MS = 86_400_000
/** The chart's default window; it also sets the scale the full history scrolls at. */
const CHART_WINDOW_MS = 5 * 365.25 * DAY_MS
/** Year labels closer than this to either end (in % of the card's width) would hit the end labels. */
const YEAR_LABEL_END_GAP_PCT = 8

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const COLS_COACH =
  "grid-cols-[var(--time-w)_44px_72px_minmax(0,1fr)_112px_28px] max-[600px]:grid-cols-[76px_36px_60px_minmax(0,1fr)_28px]"
const COLS_ATHLETE =
  "grid-cols-[var(--time-w)_44px_72px_minmax(0,1fr)_112px] max-[600px]:grid-cols-[76px_36px_60px_minmax(0,1fr)]"

/** "Jul 2026" */
function monthYear(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "2026-2027" → "2026–27" */
function shortSeason(season: string): string {
  const [start, end] = season.split("-")
  return `${start}–${end?.slice(2)}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase leading-4 tracking-[0.04em] text-foreground-tertiary">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/** One event + course: PB, progression chart, and every swim of it. */
export default function EventDrilldown({
  event,
  course,
  swims,
  marks,
  isCoach,
  onBack,
}: {
  event: string
  course: string
  swims: AthleteSwim[]
  marks: SwimMarks
  isCoach: boolean
  onBack: () => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [showFullHistory, setShowFullHistory] = useState(false)
  // Read the clock once, not on every render.
  const [windowStart] = useState(() => Date.now() - CHART_WINDOW_MS)
  const chartScrollRef = useRef<HTMLDivElement>(null)

  const sel = useMemo(
    () => swims.filter((s) => s.event === event && s.course === course),
    [swims, event, course]
  )
  const chrono = useMemo(() => [...sel].sort(compareSwimsChronologically), [sel])
  const rows = useMemo(() => [...sel].sort(compareSwimsNewestFirst), [sel])

  const pb = sel.reduce<AthleteSwim | null>((best, s) => (!best || s.timeMs < best.timeMs ? s : best), null)
  const season = currentSeason()
  const seasonTimes = sel.filter((s) => seasonFromDate(s.date.slice(0, 10)) === season).map((s) => s.timeMs)
  const seasonBest = seasonTimes.length ? Math.min(...seasonTimes) : null
  const drop = pb && chrono.length > 1 ? chrono[0]!.timeMs - pb.timeMs : 0

  // Chart: the last 5 years by default (all of it if none are that recent), or the full history.
  const recent = chrono.filter((s) => Date.parse(s.date) >= windowStart)
  const hasOlderSwims = recent.length > 0 && recent.length < chrono.length
  const plotted = showFullHistory || recent.length === 0 ? chrono : recent

  // Faster times sit higher; x is to scale with the date.
  const times = plotted.map((s) => s.timeMs)
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const n = plotted.length
  const firstMs = n ? Date.parse(plotted[0]!.date) : 0
  const lastMs = n ? Date.parse(plotted[n - 1]!.date) : 0
  const spanMs = lastMs - firstMs
  const xAt = (ms: number) => (spanMs === 0 ? 50 : 3 + ((ms - firstMs) / spanMs) * 94)
  const points = plotted.map((s) => ({
    swim: s,
    x: xAt(Date.parse(s.date)),
    y: tMax === tMin ? 50 : 12 + ((s.timeMs - tMin) / (tMax - tMin)) * 76,
  }))
  const hovered = points.find((p) => p.swim.id === hoverId) ?? null
  const pbPoint = points.find((p) => p.swim.id === pb?.id) ?? null

  // The full history keeps the 5-year view's scale, so it grows wider than the card and scrolls.
  const widthRatio = showFullHistory ? Math.max(1, spanMs / CHART_WINDOW_MS) : 1

  // A label at each Jan 1 inside the range, clear of the first/last labels.
  const yearTicks: { year: number; x: number }[] = []
  if (spanMs > 0) {
    const endGap = YEAR_LABEL_END_GAP_PCT / widthRatio
    for (let year = new Date(firstMs).getUTCFullYear() + 1; year <= new Date(lastMs).getUTCFullYear(); year++) {
      const x = xAt(Date.UTC(year, 0, 1))
      if (x > endGap && x < 100 - endGap) yearTicks.push({ year, x })
    }
  }

  // Open on the newest swims when the chart is wider than its card.
  useLayoutEffect(() => {
    const el = chartScrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [event, course, showFullHistory])

  const longestTime = rows.reduce((m, s) => Math.max(m, formatTime(s.timeMs).length), 0)
  const tableStyle = { "--time-w": `${Math.max(40, Math.ceil(longestTime * 8.5) + 2)}px` } as CSSProperties
  // The delete column only earns its space when one of these swims can be deleted.
  const showDelete = isCoach && rows.some(isDeletableSwim)
  const cols = showDelete ? COLS_COACH : COLS_ATHLETE

  if (!pb) return null

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm font-medium text-foreground-tertiary transition-colors hover:text-foreground"
      >
        ← History
      </button>

      <section
        aria-label="Selected event"
        className="rounded-xl border border-border-secondary bg-background px-6 pb-4 pt-5 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xs font-medium uppercase leading-4 tracking-wide text-foreground-secondary">
              {event} · {course} · Personal best
            </h2>
            <p className="mt-1.5 font-mono text-[44px] font-semibold leading-[48px] tracking-[-0.02em] tabular-nums">
              {formatTime(pb.timeMs)}
            </p>
          </div>
          <div className="flex gap-7 text-right max-[600px]:gap-5 max-[600px]:text-left">
            <Stat label="Swims" value={String(sel.length)} />
            <Stat label={`${shortSeason(season)} best`} value={seasonBest == null ? "—" : formatTime(seasonBest)} />
            <Stat label="Dropped" value={drop > 0 ? `−${formatTimeDelta(drop)}` : "—"} />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <div aria-hidden className="relative h-[200px] w-[52px] shrink-0 text-[11px] text-foreground-tertiary">
            <span className="absolute right-0 top-[12%] -translate-y-1/2 font-mono tabular-nums">
              {formatTime(tMin)}
            </span>
            {tMax !== tMin && (
              <span className="absolute right-0 top-[88%] -translate-y-1/2 font-mono tabular-nums">
                {formatTime(tMax)}
              </span>
            )}
          </div>
          <div ref={chartScrollRef} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width: `${widthRatio * 100}%` }}>
            <div className="relative h-[200px]" onMouseLeave={() => setHoverId(null)}>
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
                className="absolute inset-0 h-full w-full overflow-visible"
              >
                <line x1="0" y1="12" x2="100" y2="12" stroke="var(--brand-color-border-secondary)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="var(--brand-color-border-secondary)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <line x1="0" y1="88" x2="100" y2="88" stroke="var(--brand-color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <polyline
                  points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="var(--brand-color-primary)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {points.map((p) => {
                const isPb = p.swim.id === pb.id
                const isHovered = p.swim.id === hoverId
                return (
                  <span
                    key={p.swim.id}
                    onMouseEnter={() => setHoverId(p.swim.id)}
                    onClick={() => setHoverId(p.swim.id)}
                    className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  >
                    <span
                      className={`rounded-full shadow-[0_0_0_2px_var(--brand-color-bg-container)] transition-[width,height] duration-100 ${
                        isPb || isHovered ? "h-3 w-3 bg-primary" : "h-2 w-2 bg-foreground-tertiary"
                      }`}
                    />
                  </span>
                )
              })}
              {pbPoint && !hovered && (
                <span
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-[150%] text-[11px] font-semibold tracking-[0.06em] text-accent"
                  style={{ left: `${pbPoint.x}%`, top: `${pbPoint.y}%` }}
                >
                  PB
                </span>
              )}
              {hovered && (
                <div
                  className="pointer-events-none absolute z-[2] min-w-[168px] max-w-[260px] rounded-lg border border-border bg-background-elevated px-2.5 py-2 shadow-lg"
                  style={{
                    left: `${hovered.x}%`,
                    top: `${hovered.y}%`,
                    // Near the top, open below the point so the scroll box doesn't clip it.
                    transform: `translate(${hovered.x > 75 ? "-100%" : hovered.x < 25 ? "0%" : "-50%"}, ${
                      hovered.y < 40 ? "14px" : "calc(-100% - 14px)"
                    })`,
                  }}
                >
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatTime(hovered.swim.timeMs)}
                    {hovered.swim.id === pb.id ? "  PB" : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-secondary">{formatSwimDate(hovered.swim.date)}</p>
                  <p className="truncate text-xs text-foreground-tertiary">{hovered.swim.meet || "—"}</p>
                </div>
              )}
            </div>
            <div aria-hidden className="relative mt-2 flex justify-between pb-1 text-[11px] text-foreground-tertiary">
              <span>{n ? monthYear(plotted[0]!.date) : ""}</span>
              {yearTicks.map((tick) => (
                <span key={tick.year} className="absolute top-0 -translate-x-1/2" style={{ left: `${tick.x}%` }}>
                  {tick.year}
                </span>
              ))}
              <span>{n > 1 ? monthYear(plotted[n - 1]!.date) : ""}</span>
            </div>
          </div>
          </div>
        </div>
        {hasOlderSwims && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setHoverId(null)
                setShowFullHistory((v) => !v)
              }}
              className="text-xs font-medium text-foreground-tertiary transition-colors hover:text-foreground"
            >
              {showFullHistory ? "Show last 5 years" : `Show full history (${chrono.length} swims)`}
            </button>
          </div>
        )}
      </section>

      <section>
        <div
          style={tableStyle}
          className="overflow-hidden rounded-xl border border-border-secondary bg-background"
        >
          <div
            className={`grid ${cols} h-8 items-center gap-4 border-b border-border-secondary px-4 text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-foreground-tertiary max-[600px]:gap-2`}
          >
            <span className="text-right">Time</span>
            <span />
            <span>Imp</span>
            <span className="pl-3">Meet</span>
            <span className="text-right max-[600px]:hidden">Date</span>
            {showDelete && <span />}
          </div>
          {rows.map((swim, i) => {
            const href = swimMeetHref(swim)
            const isCurrentPb = marks.currentPb.has(swim.id)
            const wasPb = marks.pbAtTime.has(swim.id)
            const time = formatTime(swim.timeMs)
            const flags = swimFlagLabel(swim.tags)
            return (
              <div
                key={swim.id}
                className={`group relative grid ${cols} items-center gap-4 px-4 py-3 text-[15px] leading-[22px] max-[600px]:gap-2 ${
                  i > 0 ? "border-t border-border-secondary" : ""
                } ${href ? "transition-colors hover:bg-background-hover" : ""}`}
              >
                <span className="text-right font-mono font-medium tabular-nums text-foreground">{time}</span>
                <span className="flex justify-center">
                  {(isCurrentPb || wasPb) && <PbBadge current={isCurrentPb} />}
                </span>
                <ImprovementCell delta={marks.improvement.get(swim.id) ?? null} />
                <span className="flex min-w-0 items-baseline gap-1.5 pl-3 text-foreground-secondary">
                  <span className="truncate">
                    {href ? (
                      <Link
                        href={href}
                        className="after:absolute after:inset-0"
                      >
                        {swim.meet || "—"}
                      </Link>
                    ) : (
                      swim.meet || "—"
                    )}
                  </span>
                  {flags && <span className="shrink-0 text-foreground-tertiary">{flags}</span>}
                </span>
                <span className="whitespace-nowrap text-right text-sm text-foreground-secondary max-[600px]:hidden">
                  {formatSwimDate(swim.date)}
                </span>
                {showDelete && (
                  <span className="flex justify-end">
                    {isDeletableSwim(swim) && (
                      <DeleteSwimButton
                        swimId={swim.id}
                        event={swim.event}
                        course={swim.course}
                        timeLabel={time}
                        dateLabel={formatSwimDate(swim.date)}
                        meet={swim.meet || null}
                      />
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
