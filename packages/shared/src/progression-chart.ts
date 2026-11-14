/**
 * Axis math for the athlete progression chart (time vs. date), shared by the web
 * drill-down chart and the mobile athlete screen so both read the same.
 */

const DAY_MS = 86_400_000

/** The chart's default window; on web it also sets the scale the full history scrolls at. */
export const PROGRESSION_WINDOW_MS = 5 * 365.25 * DAY_MS

/** Tick steps a swim time axis may use, smallest first. */
const TIME_STEPS_MS = [
  100, 200, 250, 500, 1_000, 2_000, 2_500, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000,
]

export type ProgressionTimeAxis = {
  /** Fastest end of the axis (plotted at the top). */
  min: number
  /** Slowest end of the axis (plotted at the bottom). */
  max: number
  step: number
  /** Gridline values from `min` to `max`, every `step`. */
  ticks: number[]
}

/**
 * Round gridlines around the plotted times: the smallest step that keeps the axis to
 * `maxTicks` lines, with both ends snapped to it. A single time (or equal times) gets a
 * half-second band so it sits mid-chart rather than on an edge.
 */
export function progressionTimeAxis(minMs: number, maxMs: number, maxTicks = 5): ProgressionTimeAxis {
  let lo = Math.min(minMs, maxMs)
  let hi = Math.max(minMs, maxMs)
  if (hi - lo < 200) {
    lo -= 250
    hi += 250
  }
  let step = TIME_STEPS_MS[TIME_STEPS_MS.length - 1]!
  for (const candidate of TIME_STEPS_MS) {
    const count = Math.ceil(hi / candidate) - Math.floor(lo / candidate) + 1
    if (count <= maxTicks) {
      step = candidate
      break
    }
  }
  const min = Math.floor(lo / step) * step
  const max = Math.max(min + step, Math.ceil(hi / step) * step)
  const ticks: number[] = []
  for (let t = min; t <= max + 1e-6; t += step) ticks.push(Math.round(t))
  return { min, max, step, ticks }
}

/** An axis label for a tick: only as many decimals as the step needs ("58", "58.5", "1:02.25"). */
export function formatProgressionAxisTime(ms: number, stepMs: number): string {
  const decimals = stepMs % 1000 === 0 ? 0 : stepMs % 100 === 0 ? 1 : 2
  const totalSeconds = Math.round(ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds - minutes * 60).toFixed(decimals)
  if (minutes === 0) return seconds
  return `${minutes}:${seconds.padStart(decimals ? 3 + decimals : 2, "0")}`
}

/** Jan 1 (UTC) of each year strictly after `firstMs` and up to `lastMs`. */
export function progressionYearTicks(firstMs: number, lastMs: number): { year: number; ms: number }[] {
  const ticks: { year: number; ms: number }[] = []
  if (!(lastMs > firstMs)) return ticks
  for (let year = new Date(firstMs).getUTCFullYear() + 1; year <= new Date(lastMs).getUTCFullYear(); year++) {
    ticks.push({ year, ms: Date.UTC(year, 0, 1) })
  }
  return ticks
}

/**
 * The swims a chart opens on: those inside the window ending now, unless that leaves
 * fewer than two (then everything — one dot shows no progression).
 */
export function progressionWindowed<T extends { date: string }>(
  chrono: T[],
  windowStartMs: number
): { plotted: T[]; hasOlder: boolean } {
  const recent = chrono.filter((s) => Date.parse(s.date) >= windowStartMs)
  const hasOlder = recent.length >= 2 && recent.length < chrono.length
  return { plotted: hasOlder ? recent : chrono, hasOlder }
}

/** Dot radius for the chart's density: smaller dots when swims sit close together (px between swims). */
export function progressionDotRadius(plotWidthPx: number, pointCount: number): number {
  if (pointCount < 2) return 4
  const gap = plotWidthPx / (pointCount - 1)
  return gap < 6 ? 2.5 : gap < 12 ? 3 : 3.5
}

/**
 * For swims oldest first: which were a best when swum (the first swim counts), and each
 * swim's time against the best before it (negative = faster; null for the first).
 */
export function progressionBests<T extends { id: string; timeMs: number }>(
  chrono: T[]
): { pbAtTime: Set<string>; improvement: Map<string, number | null> } {
  const pbAtTime = new Set<string>()
  const improvement = new Map<string, number | null>()
  let best: number | null = null
  for (const swim of chrono) {
    improvement.set(swim.id, best == null ? null : swim.timeMs - best)
    if (best == null || swim.timeMs < best) {
      pbAtTime.add(swim.id)
      best = swim.timeMs
    }
  }
  return { pbAtTime, improvement }
}
