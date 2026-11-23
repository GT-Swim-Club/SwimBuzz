"use client"

import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react"
import {
  PROGRESSION_WINDOW_MS,
  formatMonthYear,
  formatProgressionAxisTime,
  progressionDotRadius,
  progressionTimeAxis,
  progressionWindowed,
  progressionYearTicks,
  UNOFFICIAL_MARK,
} from "@swimbuzz/shared"
import { formatSwimDate, formatTime } from "@/lib/utils"
import {
  compareSwimsChronologically,
  relaySplitLegLabel,
  swimRoundLabel,
  type AthleteSwim,
  type SwimMarks,
} from "@/lib/athlete/swim-history"
import { DeltaPill } from "./SwimMarks"

const PLOT_H = 200
/** Room above the fastest gridline for the "PB" label, and below the slowest for a dot. */
const PAD_TOP = 26
const PAD_BOTTOM = 10
/** Keeps the first and last dots off the plot's edges. */
const PAD_X = 14
const Y_AXIS_W = 52
const Y_AXIS_GAP = 12
/** A year label closer than this (px) to the previous one would collide. */
const YEAR_LABEL_GAP_PX = 44
/** Room (px) the month-year labels at either end of the x-axis take. */
const END_LABEL_PX = 72

type Point = { swim: AthleteSwim; x: number; y: number }

/**
 * Time-over-date chart for one event + course: faster times plot higher, dates to scale.
 * Opens on the last 5 years (the full history keeps that scale and scrolls).
 */
export default function ProgressionChart({
  swims,
  marks,
  pbId,
  splits,
}: {
  /** The event's swims (or relay splits, when `splits`), in any order. */
  swims: AthleteSwim[]
  marks: SwimMarks
  pbId: string
  /** The plotted swims are relay splits. */
  splits: boolean
}) {
  // Read the clock once, not on every render.
  const [windowStart] = useState(() => Date.now() - PROGRESSION_WINDOW_MS)
  const [showFullHistory, setShowFullHistory] = useState(false)
  /** The hovered (or tapped) point, with the scroll offset it was picked at. */
  const [hover, setHover] = useState<{ id: string; scrollLeft: number } | null>(null)
  const [frameW, setFrameW] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const chrono = useMemo(() => [...swims].sort(compareSwimsChronologically), [swims])
  const windowed = progressionWindowed(chrono, windowStart)
  const useWindow = windowed.hasOlder && !showFullHistory
  const plotted = useWindow ? windowed.plotted : chrono

  const all = plotted
  const dates = all.map((s) => Date.parse(s.date))
  const firstMs = dates.length ? Math.min(...dates) : 0
  const lastMs = dates.length ? Math.max(...dates) : 0
  const spanMs = lastMs - firstMs
  const axis = progressionTimeAxis(
    all.length ? Math.min(...all.map((s) => s.timeMs)) : 0,
    all.length ? Math.max(...all.map((s) => s.timeMs)) : 0
  )

  // The full history keeps the 5-year view's scale, so it grows wider than the card and scrolls.
  const widthRatio = useWindow || !windowed.hasOlder ? 1 : Math.max(1, spanMs / PROGRESSION_WINDOW_MS)
  const plotW = Math.floor(frameW * widthRatio)
  /** Only the full history outgrows the card; the 5-year view always fits. */
  const scrolls = widthRatio > 1
  const xAt = (ms: number) => (spanMs === 0 ? plotW / 2 : PAD_X + ((ms - firstMs) / spanMs) * (plotW - 2 * PAD_X))
  const yAt = (ms: number) => PAD_TOP + ((ms - axis.min) / (axis.max - axis.min)) * (PLOT_H - PAD_TOP - PAD_BOTTOM)
  const points: Point[] = plotted.map((swim) => ({ swim, x: xAt(Date.parse(swim.date)), y: yAt(swim.timeMs) }))
  const hovered = points.find((p) => p.swim.id === hover?.id) ?? null
  const pbPoint = points.find((p) => p.swim.id === pbId) ?? null
  const r = progressionDotRadius(plotW - 2 * PAD_X, points.length)

  // A faint line at each Jan 1; a year label wherever it clears the end labels and the last year.
  const yearLines = progressionYearTicks(firstMs, lastMs).map((tick) => ({ year: tick.year, x: xAt(tick.ms) }))
  const yearLabels: typeof yearLines = []
  for (const tick of yearLines) {
    const prev = yearLabels[yearLabels.length - 1]
    if (tick.x < END_LABEL_PX || tick.x > plotW - END_LABEL_PX) continue
    if (prev && tick.x - prev.x < YEAR_LABEL_GAP_PX) continue
    yearLabels.push(tick)
  }
  const fastestMs = all.length ? Math.min(...all.map((s) => s.timeMs)) : 0

  // One swim shows no progression; that state says so rather than draw a lone dot.
  const charted = chrono.length > 1

  // Track the card's width; the chart is drawn in pixels so dots stay round.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Rounded down: clientWidth can round a fractional width up and overflow by a hair.
    const measure = () => setFrameW(Math.floor(el.getBoundingClientRect().width))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [charted])

  // Open on the newest swims when the chart is wider than its card.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = scrolls ? el.scrollWidth : 0
  }, [showFullHistory, plotW, scrolls])

  /** Snap to the nearest point to the pointer. */
  function pick(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    let best: Point | null = null
    let bestD = Infinity
    for (const p of points) {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0
    if (best && best.swim.id !== hover?.id) setHover({ id: best.swim.id, scrollLeft })
  }

  const noun = splits ? "splits" : "swims"

  if (chrono.length === 0) {
    return <p className="mt-5 text-sm text-foreground-tertiary">No {noun} to chart yet.</p>
  }

  if (!charted) {
    return (
      <div className="mt-5">
        <div className="flex h-[88px] items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-foreground-tertiary">
          {splits
            ? "One relay split so far. The chart starts with the second."
            : "One swim so far. The chart starts with the second."}
        </div>
      </div>
    )
  }

  const tipX = hovered ? Y_AXIS_W + Y_AXIS_GAP + hovered.x - (hover?.scrollLeft ?? 0) : 0
  const improvement = hovered ? (marks.improvement.get(hovered.swim.id) ?? null) : null
  const roundLabel = hovered && !hovered.swim.relaySplit ? swimRoundLabel(hovered.swim.tags) : ""

  return (
    <div className="mt-5">
      <div
        className="relative"
        role="img"
        aria-label={`Progression of ${points.length} ${noun} from ${formatMonthYear(new Date(firstMs))} to ${formatMonthYear(new Date(lastMs))}, ${formatTime(fastestMs)} fastest`}
      >
        <div className="flex" style={{ gap: Y_AXIS_GAP }}>
          <div aria-hidden className="relative shrink-0 text-[11px] text-foreground-tertiary" style={{ width: Y_AXIS_W, height: PLOT_H }}>
            {axis.ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 -translate-y-1/2 font-mono tabular-nums"
                style={{ top: yAt(t) }}
              >
                {formatProgressionAxisTime(t, axis.step)}
              </span>
            ))}
          </div>
          <div
            ref={scrollRef}
            onScroll={() => setHover(null)}
            className={`min-w-0 flex-1 overflow-y-hidden ${scrolls ? "overflow-x-auto" : "overflow-x-hidden"}`}
          >
            {plotW > 0 && (
              <div style={{ width: plotW }}>
                <svg
                  aria-hidden
                  width={plotW}
                  height={PLOT_H}
                  className="block"
                  onPointerMove={pick}
                  onPointerDown={pick}
                  onPointerLeave={(e) => {
                    // A tap keeps its tooltip until the next tap or a scroll.
                    if (e.pointerType === "mouse") setHover(null)
                  }}
                >
                  {axis.ticks.map((t, i) => (
                    <line
                      key={t}
                      x1={0}
                      x2={plotW}
                      y1={yAt(t)}
                      y2={yAt(t)}
                      stroke={i === axis.ticks.length - 1 ? "var(--brand-color-border)" : "var(--brand-color-border-secondary)"}
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                  ))}
                  {yearLines.map((tick) => (
                    <line
                      key={tick.year}
                      x1={tick.x}
                      x2={tick.x}
                      y1={PAD_TOP}
                      y2={PLOT_H - PAD_BOTTOM}
                      stroke="var(--brand-color-border-secondary)"
                      strokeDasharray="2 4"
                      shapeRendering="crispEdges"
                    />
                  ))}
                  {hovered && (
                    <line
                      x1={hovered.x}
                      x2={hovered.x}
                      y1={PAD_TOP - 6}
                      y2={PLOT_H - PAD_BOTTOM}
                      stroke="var(--brand-color-border)"
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                  )}
                  {points.length > 1 && (
                    <polyline
                      points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="var(--brand-color-primary)"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                  {points.map((p) => {
                    const isPb = p.swim.id === pbId
                    const wasPb = marks.pbAtTime.has(p.swim.id)
                    const color = isPb || wasPb ? "var(--brand-color-primary)" : "var(--brand-color-text-tertiary)"
                    // An unofficial (intrasquad) swim is a hollow ring in the same color.
                    return p.swim.unofficial ? (
                      <circle
                        key={p.swim.id}
                        cx={p.x}
                        cy={p.y}
                        r={(isPb ? r + 1.5 : r) - 0.75}
                        fill="var(--brand-color-bg-container)"
                        stroke={color}
                        strokeWidth={1.5}
                      />
                    ) : (
                      <circle
                        key={p.swim.id}
                        cx={p.x}
                        cy={p.y}
                        r={isPb ? r + 1.5 : r}
                        fill={color}
                        stroke="var(--brand-color-bg-container)"
                        strokeWidth={isPb ? 2 : 1.5}
                      />
                    )
                  })}
                  {hovered && (
                    <circle
                      cx={hovered.x}
                      cy={hovered.y}
                      r={(hovered.swim.id === pbId ? r + 1.5 : r) + 3.5}
                      fill="none"
                      stroke="var(--brand-color-primary)"
                      strokeWidth={1.5}
                    />
                  )}
                  {pbPoint && hovered?.swim.id !== pbId && (
                    <text
                      x={pbPoint.x}
                      y={pbPoint.y - r - 8}
                      textAnchor="middle"
                      fill="var(--brand-color-accent)"
                      fontSize={11}
                      fontWeight={600}
                      letterSpacing="0.06em"
                      className="pointer-events-none select-none"
                    >
                      {pbPoint.swim.unofficial ? "*PB" : "PB"}
                    </text>
                  )}
                </svg>
                <div aria-hidden className="relative mt-2 h-4 text-[11px] leading-4 text-foreground-tertiary">
                  {spanMs === 0 ? (
                    <span className="absolute top-0 -translate-x-1/2" style={{ left: plotW / 2 }}>
                      {formatMonthYear(new Date(firstMs))}
                    </span>
                  ) : (
                    <>
                      <span className="absolute left-0 top-0">{formatMonthYear(new Date(firstMs))}</span>
                      {yearLabels.map((tick) => (
                        <span key={tick.year} className="absolute top-0 -translate-x-1/2" style={{ left: tick.x }}>
                          {tick.year}
                        </span>
                      ))}
                      <span className="absolute right-0 top-0">{formatMonthYear(new Date(lastMs))}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {hovered && (
          <div
            className="pointer-events-none absolute z-[2] w-max min-w-[168px] max-w-[260px] rounded-lg border border-border bg-background-elevated px-2.5 py-2 shadow-lg"
            style={{
              left: tipX,
              top: hovered.y,
              // Keep it inside the card at either end; open below points near the top.
              transform: `translate(${
                tipX - Y_AXIS_W < 96 ? "-16px" : tipX > Y_AXIS_W + Y_AXIS_GAP + frameW - 96 ? "calc(-100% + 16px)" : "-50%"
              }, ${hovered.y < PLOT_H * 0.45 ? "16px" : "calc(-100% - 16px)"})`,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold tabular-nums">
                {hovered.swim.unofficial ? <span className="text-accent">{UNOFFICIAL_MARK}</span> : null}
                {formatTime(hovered.swim.timeMs)}
              </span>
              {hovered.swim.id === pbId && (
                <span className="rounded-md bg-primary-bg px-1.5 text-[11px] font-bold leading-[18px] tracking-[0.04em] text-accent">
                  PB
                </span>
              )}
              {improvement != null && <DeltaPill delta={improvement} />}
            </div>
            <p className="mt-1 text-xs text-foreground-secondary">{formatSwimDate(hovered.swim.date)}</p>
            <p className="truncate text-xs text-foreground-tertiary">{hovered.swim.meet || "—"}</p>
            {hovered.swim.unofficial ? <p className="text-xs text-accent">Unofficial</p> : null}
            {hovered.swim.relaySplit ? (
              <p className="truncate text-xs text-foreground-tertiary">
                {relaySplitLegLabel(hovered.swim.relaySplit)} · Flying start
              </p>
            ) : (
              roundLabel && <p className="truncate text-xs text-foreground-tertiary">{roundLabel}</p>
            )}
          </div>
        )}
      </div>

      {windowed.hasOlder && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setHover(null)
              setShowFullHistory((v) => !v)
            }}
            className="text-xs font-medium text-foreground-tertiary transition-colors hover:text-foreground"
          >
            {showFullHistory ? "Show last 5 years" : `Show full history (${chrono.length} ${noun})`}
          </button>
        </div>
      )}
    </div>
  )
}
