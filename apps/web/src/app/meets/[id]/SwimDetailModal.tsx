"use client"

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import type { ResultSplit } from "@/lib/meet/meet-sheet-summary"
import { sanitizeRelaySplitTime } from "@/lib/meet/relay-results"
import { formatDisplayTime, formatOrdinal, formatSeedTimeDelta, parseTime } from "@/lib/utils"

export type DetailRound = {
  label: string
  time?: string
  status?: string
  place?: number
  /** Place counts as a podium finish (finals-type round). */
  podium?: boolean
  seedTime?: string
  seedRank?: number | string
  heat?: string
  lane?: number
  splits: ResultSplit[]
}

export type SwimDetail = {
  kind: "individual" | "relay"
  eventNumber?: number
  athleteName?: string
  athleteHref?: string
  title: string
  subLine: string
  /** One round, or prelims + finals for a combined individual view. */
  rounds: DetailRound[]
  /** `splits` are the leg's interval 50s (distance within the leg) for legs longer than 50. */
  relaySwimmers?: Array<{ name: string; split?: string; splits?: ResultSplit[] }>
  coachNote?: string
}

const PODIUM_TEXT: Record<number, string> = {
  1: "text-amber-600 dark:text-amber-400",
  2: "text-slate-500 dark:text-slate-300",
  3: "text-orange-600 dark:text-orange-400",
}

export function deltaPillClass(delta: string) {
  return delta.startsWith("-") || delta.startsWith("−")
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
    : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
}

/** Display a signed delta with a true minus sign. */
export function formatDelta(delta: string) {
  return delta.replace(/^-/, "−")
}

function seconds(t?: string): number {
  if (!t) return NaN
  const ms = parseTime(t)
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : NaN
}

function fmtSeconds(s: number) {
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return m > 0 ? `${m}:${r < 10 ? "0" : ""}${r.toFixed(2)}` : r.toFixed(2)
}

function fmtDiff(d: number) {
  return `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}`
}

function diffClass(d: number, bold = false) {
  const tone = !Number.isFinite(d)
    ? "text-foreground-tertiary"
    : d < 0
      ? "text-emerald-600 dark:text-emerald-300"
      : d > 0
        ? "text-red-600 dark:text-red-300"
        : "text-foreground-secondary"
  return `text-right ${bold ? "font-semibold" : "font-normal"} ${tone}`
}

function sortedSplits(splits: ResultSplit[]) {
  return [...splits]
    .sort((a, b) => a.distance - b.distance)
    .map((s) => ({ label: String(s.distance), time: sanitizeRelaySplitTime(s.splitTime) }))
}

function roundDelta(round?: DetailRound) {
  if (!round?.seedTime || !round.time) return null
  return formatSeedTimeDelta(round.seedTime, round.time)
}

function PlaceText({ round, className = "text-sm" }: { round: DetailRound; className?: string }) {
  if (round.place == null || !(round.time || round.status)) {
    return <span className="text-foreground-tertiary">—</span>
  }
  const podium = round.podium && round.place >= 1 && round.place <= 3
  return (
    <span
      className={`${className} ${podium ? `font-semibold ${PODIUM_TEXT[round.place]}` : "font-medium text-foreground"}`}
    >
      {formatOrdinal(round.place)}
    </span>
  )
}

type ChartSeries = {
  values: number[]
  stroke: string
  text: string
  dashed?: boolean
}

/** A run of consecutive points (e.g. one relay leg's 50s) labelled once on the x-axis. */
type ChartGroup = { label: string; start: number; end: number }

// Base chart width in viewBox units — roughly the modal's content width in px,
// so text renders near 1:1.
const CHART_WIDTH = 460
// Past this many points the value labels would overlap, so instead of
// squeezing, points keep this spacing and the chart scrolls horizontally.
const MAX_FITTED_POINTS = 8
const POINT_SPACING = (CHART_WIDTH - 100) / (MAX_FITTED_POINTS - 1)

function SplitChart({
  series,
  labels,
  groups,
}: {
  series: ChartSeries[]
  labels: string[]
  /** When set, the x-axis shows group labels (with dividers between groups) instead of `labels`. */
  groups?: ChartGroup[]
}) {
  const n = labels.length
  const step = n > MAX_FITTED_POINTS ? POINT_SPACING : (CHART_WIDTH - 100) / Math.max(1, n - 1)
  const width = n > MAX_FITTED_POINTS ? 100 + (n - 1) * step : CHART_WIDTH
  const xs = labels.map((_, i) => (n === 1 ? CHART_WIDTH / 2 : 50 + i * step))
  const all = series.flatMap((s) => s.values).filter(Number.isFinite)
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  const pad = (hi - lo) * 0.08 || 0.5
  lo -= pad
  hi += pad
  const y = (v: number) => 26 + ((v - lo) / (hi - lo)) * 82

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} 150`}
        // Sized relative to the container so wider charts keep the same scale and scroll.
        style={{ width: `${(width / CHART_WIDTH) * 100}%` }}
        className="block h-auto max-w-none font-mono"
        aria-hidden
      >
        <line x1={0} y1={20} x2={width} y2={20} stroke="var(--brand-color-border-subtle)" />
        <line x1={0} y1={70} x2={width} y2={70} stroke="var(--brand-color-border-subtle)" />
        <line x1={0} y1={128} x2={width} y2={128} stroke="var(--brand-color-border)" />
        {groups?.slice(1).map((g) => {
          const x = (xs[g.start - 1] + xs[g.start]) / 2
          return (
            <line
              key={g.start}
              x1={x}
              y1={20}
              x2={x}
              y2={128}
              stroke="var(--brand-color-border-subtle)"
              strokeDasharray="3 3"
            />
          )
        })}
        {series.map((s, si) => {
          return (
            <g key={si}>
              <polyline
                points={s.values.map((v, i) => `${xs[i]},${y(v)}`).join(" ")}
                fill="none"
                stroke={s.stroke}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "5 4" : undefined}
              />
              {s.values.map((v, i) => {
                const solid = !s.dashed
                return (
                  <circle
                    key={i}
                    cx={xs[i]}
                    cy={y(v)}
                    r={4.5}
                    fill={solid ? s.stroke : "var(--brand-color-bg-container)"}
                    stroke={s.stroke}
                    strokeWidth={2}
                  />
                )
              })}
            </g>
          )
        })}
        {labels.map((label, i) => {
          const points = series
            .map((s) => ({ v: s.values[i], s }))
            .filter((p) => Number.isFinite(p.v))
            .sort((a, b) => a.v - b.v)
          return (
            <g key={i}>
              {points.map((p, k) => {
                const below = points.length > 1 && k === points.length - 1
                return (
                  <text
                    key={k}
                    x={xs[i]}
                    y={below ? y(p.v) + 17 : y(p.v) - 10}
                    fontSize={11}
                    fill={p.s.text}
                    textAnchor="middle"
                  >
                    {fmtSeconds(p.v)}
                  </text>
                )
              })}
              {groups ? null : (
                <text
                  x={xs[i]}
                  y={145}
                  fontSize={11}
                  fill="var(--brand-color-text-tertiary)"
                  textAnchor="middle"
                  className="font-sans"
                >
                  {label}
                </text>
              )}
            </g>
          )
        })}
        {groups?.map((g) => (
          <text
            key={g.start}
            x={(xs[g.start] + xs[g.end]) / 2}
            y={145}
            fontSize={11}
            fill="var(--brand-color-text-tertiary)"
            textAnchor="middle"
            className="font-sans"
          >
            {g.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

function SegmentedToggle<T extends string | number>({
  label,
  options,
  value,
  onChange,
  mono = false,
}: {
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  mono?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-border p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${mono ? "font-mono tabular-nums" : ""} ${
              active ? "bg-primary text-primary-text" : "text-foreground-tertiary hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function validSeries(times: Array<string | undefined>) {
  const values = times.map((t) => seconds(t))
  return values.length >= 2 && values.every(Number.isFinite) ? values : null
}

/** An interval split: `seconds` swum over the stretch ending at `distance` (cumulative). */
type IntervalSplit = { distance: number; seconds: number }

// Chart interval choices, coarsest last. Within a tier, the first option that
// divides the race evenly wins (e.g. 250 for a 500/1000, 200 for a 400/800;
// 500 for a 1000, 550 for the 1650).
const SPLIT_STEP_TIERS = [[50], [100], [250, 200], [500, 550]]

function toIntervalSplits(rows: Array<{ label: string; time?: string }>, offset = 0): IntervalSplit[] {
  return rows.map((r) => ({ distance: offset + Number(r.label), seconds: seconds(r.time) }))
}

/** Table rows (distance label + formatted time) for aggregated splits. */
function splitRows(splits: IntervalSplit[]) {
  return splits.map((x) => ({ label: String(x.distance), time: fmtSeconds(x.seconds) }))
}

/** Sum consecutive splits into `step`-sized stretches; null if the splits don't land on every boundary. */
function aggregateSplits(splits: IntervalSplit[], step: number): IntervalSplit[] | null {
  const total = splits[splits.length - 1].distance
  const distances = new Set(splits.map((s) => s.distance))
  for (let d = step; d < total; d += step) if (!distances.has(d)) return null
  const out: IntervalSplit[] = []
  let acc = 0
  for (const [i, s] of splits.entries()) {
    acc += s.seconds
    if (s.distance % step === 0 || i === splits.length - 1) {
      out.push({ distance: s.distance, seconds: acc })
      acc = 0
    }
  }
  return out.length >= 2 && out.every((s) => Number.isFinite(s.seconds)) ? out : null
}

/** Intervals the chart can be toggled between for these splits, finest first. */
function splitStepOptions(splits: IntervalSplit[], maxStep = Infinity): number[] {
  if (splits.length < 2) return []
  const total = splits[splits.length - 1].distance
  const options: number[] = []
  for (const tier of SPLIT_STEP_TIERS) {
    // 100 is always offered (the mile just ends on a 50); coarser tiers need an even fit.
    const step = tier[0] === 100 ? 100 : tier.find((t) => total % t === 0)
    if (!step || step > maxStep || step < splits[0].distance) continue
    if (aggregateSplits(splits, step)) options.push(step)
  }
  return options
}

const cellLabel = "text-[11px] font-medium uppercase tracking-[0.04em] text-foreground-tertiary"
const tableHead =
  "bg-fill-secondary/60 px-3 py-2 text-xs font-medium uppercase tracking-[0.025em] text-foreground-tertiary dark:bg-fill-secondary"
const totalRow = "border-t border-border bg-fill-secondary/60 px-3 py-[9px] text-sm font-semibold dark:bg-fill-secondary"

export default function SwimDetailModal({
  detail,
  onClose,
  onEditRelay,
}: {
  detail: SwimDetail
  onClose: () => void
  /** Shown as the footer's primary action for coaches on relay rows. */
  onEditRelay?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [chosenStep, setChosenStep] = useState<number | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const combined = detail.kind === "individual" && detail.rounds.length > 1
  const last = detail.rounds[detail.rounds.length - 1]
  const first = detail.rounds[0]
  const headDelta = roundDelta(last)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  // Shrink long event titles to fit one line.
  useLayoutEffect(() => {
    const el = titleRef.current
    if (!el) return
    let size = 18
    el.style.fontSize = `${size}px`
    while (el.scrollWidth > el.clientWidth + 0.5 && size > 11) {
      size -= 0.5
      el.style.fontSize = `${size}px`
    }
  }, [mounted, detail.title])

  if (!mounted) return null

  // Split rows + chart
  let splitTable: React.ReactNode = null
  let chart: React.ReactNode = null
  let stepOptions: number[] = []
  let activeStep = 0
  // The chosen interval sticks while it's still offered; otherwise the finest one.
  const pickStep = (options: number[]) => {
    stepOptions = options
    activeStep = chosenStep != null && options.includes(chosenStep) ? chosenStep : options[0]
    return activeStep
  }
  if (combined) {
    const a = sortedSplits(first.splits)
    const b = sortedSplits(last.splits)
    if (a.length > 0 || b.length > 0) {
      const ia = validSeries(a.map((x) => x.time)) ? toIntervalSplits(a) : null
      const ib = validSeries(b.map((x) => x.time)) ? toIntervalSplits(b) : null
      // Offer only intervals that work for every round that has a full set of splits.
      const usable = [ia, ib].filter((sp): sp is IntervalSplit[] => sp != null)
      const options = usable.length
        ? splitStepOptions(usable[0]).filter((step) => usable.every((sp) => aggregateSplits(sp, step)))
        : []
      // No interval fits (irregular split distances) → plot the raw splits, no toggle.
      const step = options.length ? pickStep(options) : 0
      const aa = ia && (step ? aggregateSplits(ia, step) : ia)
      const ab = ib && (step ? aggregateSplits(ib, step) : ib)

      // The table follows the chosen interval; a round without usable splits shows dashes.
      const ta = step ? (aa ? splitRows(aa) : []) : a
      const tb = step ? (ab ? splitRows(ab) : []) : b
      const rows = Array.from({ length: Math.max(ta.length, tb.length) }, (_, i) => {
        const x = ta[i]
        const y = tb[i]
        const d = seconds(y?.time) - seconds(x?.time)
        return { label: (x ?? y)!.label, a: x?.time, b: y?.time, d }
      })
      const totalDiff = seconds(last.time) - seconds(first.time)
      const grid = "grid grid-cols-[1fr_80px_80px_64px]"
      splitTable = (
        <ul className="overflow-hidden rounded-lg border border-border">
          <li className={`${grid} ${tableHead}`}>
            <span>Distance</span>
            <span className="text-right">{first.label}</span>
            <span className="text-right">{last.label}</span>
            <span className="text-right">Δ</span>
          </li>
          {rows.map((r) => (
            <li
              key={r.label}
              className={`${grid} border-t border-border px-3 py-[9px] font-mono text-sm tabular-nums`}
            >
              <span className="text-foreground-secondary">{r.label}</span>
              <span className="text-right text-foreground-secondary">{r.a ? formatDisplayTime(r.a) : "—"}</span>
              <span className="text-right text-foreground">{r.b ? formatDisplayTime(r.b) : "—"}</span>
              <span className={diffClass(r.d)}>{Number.isFinite(r.d) ? fmtDiff(r.d) : "—"}</span>
            </li>
          ))}
          <li className={`${grid} ${totalRow} font-mono tabular-nums`}>
            <span className="font-sans font-medium text-foreground-secondary">Total</span>
            <span className="text-right text-foreground-secondary">
              {first.time ? formatDisplayTime(first.time) : "—"}
            </span>
            <span className="text-right text-foreground">
              {last.time ? formatDisplayTime(last.time) : "—"}
            </span>
            <span className={diffClass(totalDiff, true)}>
              {Number.isFinite(totalDiff) ? fmtDiff(totalDiff) : "—"}
            </span>
          </li>
        </ul>
      )

      const series: ChartSeries[] = []
      if (aa) {
        series.push({
          values: aa.map((x) => x.seconds),
          stroke: "var(--brand-color-text-tertiary)",
          text: "var(--brand-color-text-tertiary)",
          dashed: true,
        })
      }
      if (ab) {
        series.push({
          values: ab.map((x) => x.seconds),
          stroke: "var(--brand-color-accent)",
          text: "var(--brand-color-text)",
        })
      }
      const axis = ab ?? aa
      if (series.length && axis) {
        chart = <SplitChart series={series} labels={axis.map((x) => String(x.distance))} />
      }
    }
  } else if (detail.kind === "relay") {
    const swimmers = detail.relaySwimmers ?? []
    if (swimmers.length > 0) {
      const lastNames = swimmers.map((s) => s.name.split(",")[0].trim())
      // Plot every 50 when each leg has the same full set of interval splits;
      // otherwise fall back to one point per leg.
      const legSplits = swimmers.map((s) => sortedSplits(s.splits ?? []))
      const perLeg = legSplits[0].length
      const perFifty = perLeg > 1 && legSplits.every((l) => l.length === perLeg)
      const legDistance = perFifty ? Number(legSplits[0][perLeg - 1].label) : 0
      const flat = perFifty
        ? legSplits.flatMap((l, i) => toIntervalSplits(l, i * legDistance))
        : []
      // Intervals stop at one leg — combining parts of two swimmers' legs isn't meaningful.
      const options = flat.length && flat.every((x) => Number.isFinite(x.seconds))
        ? splitStepOptions(flat, legDistance)
        : []
      const step = options.length ? pickStep(options) : 0
      const stretches = step ? aggregateSplits(flat, step) : null
      const perGroup = stretches ? legDistance / step : 0
      // Raw leg splits are distances within the leg; shift them onto race distance.
      const legStartDistance = (i: number) =>
        legSplits.slice(0, i).reduce((sum, l) => sum + (Number(l[l.length - 1]?.label) || 0), 0)

      // Each leg's sub-rows follow the chosen interval; at a full leg they're
      // just the leg split again, so they're hidden.
      const legRows = (i: number) =>
        stretches
          ? perGroup > 1
            ? stretches
                .slice(i * perGroup, (i + 1) * perGroup)
                .map((x) => ({ label: String(x.distance), time: fmtSeconds(x.seconds) }))
            : []
          : legSplits[i].map((r) => ({ ...r, label: String(legStartDistance(i) + Number(r.label)) }))
      const relayGrid = "grid grid-cols-[1fr_auto] gap-2"
      splitTable = (
        <ul className="overflow-hidden rounded-lg border border-border">
          <li className={`${relayGrid} ${tableHead}`}>
            <span>Swimmer</span>
            <span className="text-right">Split</span>
          </li>
          {swimmers.map((s, i) => {
            const subRows = legRows(i)
            const hasSubRows = subRows.length > 1
            return (
              <Fragment key={`${i}-${s.name}`}>
                {hasSubRows
                  ? subRows.map((r) => (
                      <li
                        key={r.label}
                        className={`${relayGrid} border-t border-border px-3 py-[9px] font-mono text-sm tabular-nums`}
                      >
                        <span className="text-foreground-secondary">{r.label}</span>
                        <span className="text-right text-foreground">
                          {r.time ? formatDisplayTime(r.time) : "—"}
                        </span>
                      </li>
                    ))
                  : null}
                {/* The leg total follows its 50s, tinted as a subtotal when there are 50s above it. */}
                <li
                  className={`${relayGrid} items-center border-t border-border px-3 py-[9px] text-sm ${
                    hasSubRows ? "bg-fill-secondary/40 font-medium" : ""
                  }`}
                >
                  <span className="truncate text-foreground">{s.name}</span>
                  <span className="text-right font-mono tabular-nums text-foreground">
                    {s.split ? formatDisplayTime(s.split) : ""}
                  </span>
                </li>
              </Fragment>
            )
          })}
          {last.time ? (
            <li className={`${relayGrid} ${totalRow}`}>
              <span className="font-medium text-foreground-secondary">Total</span>
              <span className="text-right font-mono tabular-nums">{formatDisplayTime(last.time)}</span>
            </li>
          ) : null}
        </ul>
      )

      const lineStyle = {
        stroke: "var(--brand-color-primary)",
        text: "var(--brand-color-text)",
      }
      if (stretches) {
        const series = [{ values: stretches.map((x) => x.seconds), ...lineStyle }]
        // One point per leg reads better labelled by swimmer than by distance.
        chart =
          perGroup === 1 ? (
            <SplitChart series={series} labels={lastNames} />
          ) : (
            <SplitChart
              series={series}
              labels={stretches.map((x) => String(x.distance))}
              groups={lastNames.map((label, i) => ({
                label,
                start: i * perGroup,
                end: i * perGroup + perGroup - 1,
              }))}
            />
          )
      } else {
        const values = validSeries(swimmers.map((s) => s.split))
        if (values) {
          chart = <SplitChart series={[{ values, ...lineStyle }]} labels={lastNames} />
        }
      }
    }
  } else {
    const rows = sortedSplits(last.splits)
    if (rows.length > 0) {
      const splits = validSeries(rows.map((r) => r.time)) ? toIntervalSplits(rows) : null
      const options = splits ? splitStepOptions(splits) : []
      // No interval fits (irregular split distances) → plot the raw splits, no toggle.
      const stretches = splits && options.length ? aggregateSplits(splits, pickStep(options)) : splits
      // The table follows the chosen interval; with no toggle it lists the raw splits.
      const tableRows = options.length && stretches ? splitRows(stretches) : rows
      const grid = "grid grid-cols-[1fr_auto]"
      splitTable = (
        <ul className="overflow-hidden rounded-lg border border-border">
          <li className={`${grid} ${tableHead}`}>
            <span>Distance</span>
            <span className="text-right">Split</span>
          </li>
          {tableRows.map((r) => (
            <li
              key={r.label}
              className={`${grid} border-t border-border px-3 py-[9px] font-mono text-sm tabular-nums`}
            >
              <span className="text-foreground-secondary">{r.label}</span>
              <span className="text-right text-foreground">{r.time ? formatDisplayTime(r.time) : ""}</span>
            </li>
          ))}
          {last.time ? (
            <li className={`${grid} ${totalRow} font-mono tabular-nums`}>
              <span className="font-sans font-medium text-foreground-secondary">Total</span>
              <span className="text-right">{formatDisplayTime(last.time)}</span>
            </li>
          ) : null}
        </ul>
      )
      if (stretches) {
        chart = (
          <SplitChart
            series={[
              {
                values: stretches.map((x) => x.seconds),
                stroke: "var(--brand-color-primary)",
                text: "var(--brand-color-text)",
              },
            ]}
            labels={stretches.map((x) => String(x.distance))}
          />
        )
      }
    }
  }

  const seedCell = (r: DetailRound) => (
    <>
      {r.seedTime ? formatDisplayTime(r.seedTime) : "NT"}{" "}
      {r.seedRank != null ? <span className="text-foreground-tertiary">#{r.seedRank}</span> : null}
    </>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={detail.title}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 pb-4 pt-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {detail.eventNumber ? (
                  <span className="inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/10 text-lg font-semibold tabular-nums text-accent">
                    {detail.eventNumber}
                  </span>
                ) : null}
                <div className="min-w-0">
                  {detail.athleteName ? (
                    detail.athleteHref ? (
                      <Link
                        href={detail.athleteHref}
                        onClick={onClose}
                        className="text-sm font-medium text-foreground-secondary transition-colors hover:text-accent"
                      >
                        {detail.athleteName}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-foreground-secondary">{detail.athleteName}</p>
                    )
                  ) : null}
                  <h2
                    ref={titleRef}
                    className="m-0 truncate text-lg font-semibold leading-[1.3] tracking-[-0.01em] text-foreground"
                  >
                    {detail.title}
                  </h2>
                  {detail.subLine ? (
                    <div className="text-sm text-foreground-secondary">{detail.subLine}</div>
                  ) : null}
                </div>
              </div>
              {last.time || last.status ? (
                <div className="shrink-0 text-right">
                  <div className="font-mono text-2xl font-semibold leading-[1.1] tabular-nums">
                    {last.time ? formatDisplayTime(last.time) : (
                      <span className="text-amber-700 dark:text-amber-400">{last.status}</span>
                    )}
                  </div>
                  {(headDelta || last.place != null) && (
                    <div className="mt-1.5 flex items-center justify-end gap-2">
                      {headDelta ? (
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-xs font-medium ${deltaPillClass(headDelta)}`}
                        >
                          {formatDelta(headDelta)}
                        </span>
                      ) : null}
                      {last.place != null ? <PlaceText round={last} /> : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {combined ? (
              <div className="mt-3.5 overflow-hidden rounded-lg border border-border text-sm">
                <div className="grid grid-cols-[64px_1fr_1fr] bg-fill-secondary/60 dark:bg-fill-secondary">
                  <span className={`px-3 py-[7px] ${cellLabel}`} />
                  <span className={`border-l border-border px-3 py-[7px] ${cellLabel}`}>{first.label}</span>
                  <span className={`border-l border-border px-3 py-[7px] ${cellLabel}`}>{last.label}</span>
                </div>
                <div className="grid grid-cols-[64px_1fr_1fr] border-t border-border">
                  <span className="px-3 py-2 text-xs text-foreground-tertiary">Time</span>
                  {[first, last].map((r) => {
                    const d = roundDelta(r)
                    return (
                      <span key={r.label} className="flex items-center gap-2 border-l border-border px-3 py-2">
                        <span className="font-mono font-semibold tabular-nums">
                          {r.time ? formatDisplayTime(r.time) : r.status ?? "—"}
                        </span>
                        {d ? (
                          <span
                            className={`rounded-full px-[7px] py-px font-mono text-[11px] font-medium ${deltaPillClass(d)}`}
                          >
                            {formatDelta(d)}
                          </span>
                        ) : null}
                      </span>
                    )
                  })}
                </div>
                <div className="grid grid-cols-[64px_1fr_1fr] border-t border-border">
                  <span className="px-3 py-2 text-xs text-foreground-tertiary">Place</span>
                  {[first, last].map((r) => (
                    <span key={r.label} className="border-l border-border px-3 py-2">
                      <PlaceText round={r} />
                    </span>
                  ))}
                </div>
                {(["Seed", "Heat", "Lane"] as const).map((label) => (
                  <div key={label} className="grid grid-cols-[64px_1fr_1fr] border-t border-border">
                    <span className="px-3 py-2 text-xs text-foreground-tertiary">{label}</span>
                    {[first, last].map((r) => (
                      <span
                        key={r.label}
                        className="border-l border-border px-3 py-2 font-mono tabular-nums"
                      >
                        {label === "Seed"
                          ? seedCell(r)
                          : label === "Heat"
                            ? r.heat ?? "—"
                            : r.lane != null
                              ? String(r.lane)
                              : "—"}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3.5 grid grid-cols-3 rounded-lg border border-border">
                <div className="border-r border-border px-3 py-2">
                  <div className={cellLabel}>Seed</div>
                  <div className="font-mono text-sm tabular-nums">{seedCell(last)}</div>
                </div>
                <div className="border-r border-border px-3 py-2">
                  <div className={cellLabel}>Heat</div>
                  <div className="font-mono text-sm tabular-nums">{last.heat ?? "—"}</div>
                </div>
                <div className="px-3 py-2">
                  <div className={cellLabel}>Lane</div>
                  <div className="font-mono text-sm tabular-nums">
                    {last.lane != null ? String(last.lane) : "—"}
                  </div>
                </div>
              </div>
            )}
            {detail.coachNote ? (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{detail.coachNote}</p>
            ) : null}
          </div>

          {splitTable ? (
            <>
              <div className="px-6 pt-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-medium uppercase tracking-[0.04em] text-foreground-tertiary">
                      Splits
                    </span>
                    {chart && stepOptions.length > 1 ? (
                      <SegmentedToggle
                        label="Split interval"
                        mono
                        options={stepOptions.map((step) => ({ value: step, label: String(step) }))}
                        value={activeStep}
                        onChange={setChosenStep}
                      />
                    ) : null}
                  </div>
                  {combined ? (
                    <span className="flex gap-3 text-xs text-foreground-secondary">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3.5 border-t-2 border-dashed border-foreground-tertiary" />
                        {first.label}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-0.5 w-3.5 bg-accent" />
                        {last.label}
                      </span>
                    </span>
                  ) : null}
                </div>
                {chart}
              </div>
              <div className="px-6 pb-4 pt-3">{splitTable}</div>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-3 border-t border-border-subtle px-6 py-3">
          {onEditRelay ? (
            <button
              type="button"
              onClick={onEditRelay}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-text transition-colors hover:bg-primary-hover"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
              Edit relay
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-fill"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
