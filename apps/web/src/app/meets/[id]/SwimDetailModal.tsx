"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
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
  relaySwimmers?: Array<{ name: string; split?: string }>
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
  /** Only the fastest point is filled and its label emphasised. */
  fastest?: boolean
}

function SplitChart({ series, labels }: { series: ChartSeries[]; labels: string[] }) {
  const n = labels.length
  const xs = labels.map((_, i) => (n === 1 ? 200 : 50 + (i * 300) / (n - 1)))
  const all = series.flatMap((s) => s.values).filter(Number.isFinite)
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  const pad = (hi - lo) * 0.08 || 0.5
  lo -= pad
  hi += pad
  const y = (v: number) => 26 + ((v - lo) / (hi - lo)) * 82

  return (
    <svg viewBox="0 0 400 150" className="block h-auto w-full font-mono" aria-hidden>
      <line x1={0} y1={20} x2={400} y2={20} stroke="var(--brand-color-border-subtle)" />
      <line x1={0} y1={70} x2={400} y2={70} stroke="var(--brand-color-border-subtle)" />
      <line x1={0} y1={128} x2={400} y2={128} stroke="var(--brand-color-border)" />
      {series.map((s, si) => {
        const fastestIdx = s.fastest ? s.values.indexOf(Math.min(...s.values)) : -1
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
              const solid = (!s.fastest || i === fastestIdx) && !s.dashed
              return (
                <circle
                  key={i}
                  cx={xs[i]}
                  cy={y(v)}
                  r={i === fastestIdx ? 4.5 : 4}
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
              const isFastest = p.s.fastest && p.v === Math.min(...p.s.values)
              const below = points.length > 1 && k === points.length - 1
              return (
                <text
                  key={k}
                  x={xs[i]}
                  y={below ? y(p.v) + 17 : y(p.v) - 10}
                  fontSize={11}
                  fill={isFastest ? "var(--brand-color-text)" : p.s.text}
                  textAnchor="middle"
                >
                  {fmtSeconds(p.v)}
                </text>
              )
            })}
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
          </g>
        )
      })}
    </svg>
  )
}

function validSeries(times: Array<string | undefined>) {
  const values = times.map((t) => seconds(t))
  return values.length >= 2 && values.every(Number.isFinite) ? values : null
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
  if (combined) {
    const a = sortedSplits(first.splits)
    const b = sortedSplits(last.splits)
    const n = Math.max(a.length, b.length)
    if (n > 0) {
      const rows = Array.from({ length: n }, (_, i) => {
        const x = a[i]
        const y = b[i]
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
              <span className="text-right text-foreground-secondary">
                {r.a ? formatDisplayTime(r.a) : "—"}
              </span>
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
      const va = validSeries(a.map((s) => s.time))
      const vb = validSeries(b.map((s) => s.time))
      if (va) {
        series.push({
          values: va,
          stroke: "var(--brand-color-text-tertiary)",
          text: "var(--brand-color-text-tertiary)",
          dashed: true,
        })
      }
      if (vb) {
        series.push({
          values: vb,
          stroke: "var(--brand-color-accent)",
          text: "var(--brand-color-text)",
        })
      }
      if (series.length) {
        chart = <SplitChart series={series} labels={(a.length >= b.length ? a : b).map((s) => s.label)} />
      }
    }
  } else if (detail.kind === "relay") {
    const swimmers = detail.relaySwimmers ?? []
    if (swimmers.length > 0) {
      splitTable = (
        <ul className="overflow-hidden rounded-lg border border-border">
          <li className={`grid grid-cols-[1fr_auto] gap-2 ${tableHead}`}>
            <span>Swimmer</span>
            <span>Split</span>
          </li>
          {swimmers.map((s, i) => (
            <li
              key={`${i}-${s.name}`}
              className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border px-3 py-[9px] text-sm"
            >
              <span className="truncate text-foreground">{s.name}</span>
              <span className="font-mono tabular-nums text-foreground">
                {s.split ? formatDisplayTime(s.split) : ""}
              </span>
            </li>
          ))}
          {last.time ? (
            <li className={`grid grid-cols-[1fr_auto] gap-2 ${totalRow}`}>
              <span className="font-medium text-foreground-secondary">Total</span>
              <span className="font-mono tabular-nums">{formatDisplayTime(last.time)}</span>
            </li>
          ) : null}
        </ul>
      )
      const values = validSeries(swimmers.map((s) => s.split))
      if (values) {
        chart = (
          <SplitChart
            series={[
              {
                values,
                stroke: "var(--brand-color-primary)",
                text: "var(--brand-color-text-secondary)",
                fastest: true,
              },
            ]}
            labels={swimmers.map((s) => s.name.split(",")[0].trim())}
          />
        )
      }
    }
  } else {
    const rows = sortedSplits(last.splits)
    if (rows.length > 0) {
      splitTable = (
        <ul className="overflow-hidden rounded-lg border border-border">
          <li className={`grid grid-cols-[1fr_auto] ${tableHead}`}>
            <span>Distance</span>
            <span>Split</span>
          </li>
          {rows.map((r) => (
            <li
              key={r.label}
              className="grid grid-cols-[1fr_auto] border-t border-border px-3 py-[9px] font-mono text-sm tabular-nums"
            >
              <span className="text-foreground-secondary">{r.label}</span>
              <span className="text-foreground">{r.time ? formatDisplayTime(r.time) : ""}</span>
            </li>
          ))}
          {last.time ? (
            <li className={`grid grid-cols-[1fr_auto] ${totalRow} font-mono tabular-nums`}>
              <span className="font-sans font-medium text-foreground-secondary">Total</span>
              <span>{formatDisplayTime(last.time)}</span>
            </li>
          ) : null}
        </ul>
      )
      const values = validSeries(rows.map((r) => r.time))
      if (values) {
        chart = (
          <SplitChart
            series={[
              {
                values,
                stroke: "var(--brand-color-primary)",
                text: "var(--brand-color-text-secondary)",
                fastest: true,
              },
            ]}
            labels={rows.map((r) => r.label)}
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
        className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-border-subtle px-6 pb-4 pt-5">
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
              <div className="px-6 pt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-[0.04em] text-foreground-tertiary">
                    Splits
                  </span>
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
