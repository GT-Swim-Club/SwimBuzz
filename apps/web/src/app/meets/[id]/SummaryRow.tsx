"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { flushSync } from "react-dom"
import { formatDisplayTime, formatOrdinal } from "@/lib/utils"
import SwimDetailModal, { deltaPillClass, formatDelta, type SwimDetail } from "./SwimDetailModal"

export type RowDensity = "cozy" | "compact"

export type RowResult =
  | {
      kind: "done"
      time?: string
      status?: string
      delta?: string | null
      place?: number
      podium?: boolean
    }
  | { kind: "seed"; seed: string; seedRank?: number }
  | { kind: "none" }

export type RowDisplay = {
  density: RowDensity
  showRound: boolean
  showHeatLane: boolean
}

const PODIUM_PILL: Record<number, string> = {
  1: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400",
  2: "bg-slate-500/15 text-slate-600 dark:bg-slate-300/15 dark:text-slate-300",
  3: "bg-orange-500/15 text-orange-700 dark:bg-orange-400/15 dark:text-orange-400",
}

/**
 * A length easing from `wide` (in a roster summary 36rem wide or more) to `narrow` (25rem or less)
 * as the summary narrows, rather than stepping at a breakpoint. Needs a size container (the summary
 * section's `@container/summary`).
 */
export function fluidLength(narrow: number, wide: number): string {
  const from = 400
  const to = 576
  const slope = (wide - narrow) / (to - from)
  return `clamp(${narrow}px, ${(slope * 100).toFixed(3)}cqi + ${(narrow - slope * from).toFixed(2)}px, ${wide}px)`
}

/** A summary row's (and its card header's) left inset, 16px easing to 12px in a narrow summary. */
export const SUMMARY_INSET = fluidLength(12, 16)

/**
 * How much of a row's detail sits under its label instead of beside it: 0 none, 1 the heat & lane
 * (out of their column), 2 the heat & lane and the round.
 */
type RowFold = 0 | 1 | 2

/**
 * What a row needs: a fold and (for a shared short label) its short label to keep its label whole,
 * and whether what's under its label needs to run on under the right-hand columns.
 */
type RowNeed = { fold: RowFold; shortLabel: boolean; flow: boolean }

const RowFoldContext = createContext<{
  fold: RowFold
  /** Whether the rows that share their short labels (athlete names) all show them. */
  shortLabels: boolean
  /** Whether every row's right-hand columns sit on its first line, with what's below running under them. */
  flow: boolean
  /** A row's own need, or null once it's gone or hidden. */
  report: (key: string, need: RowNeed | null) => void
} | null>(null)

/**
 * Lays out every SummaryRow inside alike: each row works out how much it must move under its label
 * to keep the label whole, and all of them move that much, the most any one needs, so a list doesn't
 * mix layouts as some labels run longer than others. Likewise, once one athlete's name would wrap,
 * every athlete with a preferred name goes by it, and once what's under one row's label no longer
 * fits beside the right-hand columns, every row lets it run on beneath them.
 */
export function SummaryRowFold({ children }: { children: ReactNode }) {
  const needs = useRef(new Map<string, RowNeed>())
  const [fold, setFold] = useState<RowFold>(0)
  const [shortLabels, setShortLabels] = useState(false)
  const [flow, setFlow] = useState(false)
  const report = useCallback((key: string, need: RowNeed | null) => {
    if (need == null) needs.current.delete(key)
    else needs.current.set(key, need)
    let most: RowFold = 0
    let short = false
    let anyFlow = false
    for (const n of needs.current.values()) {
      if (n.fold > most) most = n.fold
      short ||= n.shortLabel
      anyFlow ||= n.flow
    }
    setFold(most)
    setShortLabels(short)
    setFlow(anyFlow)
  }, [])
  const value = useMemo(() => ({ fold, shortLabels, flow, report }), [fold, shortLabels, flow, report])
  return <RowFoldContext.Provider value={value}>{children}</RowFoldContext.Provider>
}

function hashMatchesId(id: string) {
  const hashes = window.location.hash.split("#").filter(Boolean)
  return hashes[hashes.length - 1] === id
}

/**
 * Without `compact`: 21px with a 10px semibold number, as on the relays page and its PNG. The roster
 * summary passes `compact` to size it to its row density instead.
 */
export function EventBadge({ number, compact }: { number: number; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/10 tabular-nums text-accent ${
        compact === undefined
          ? "h-[21px] min-w-[21px] px-[3px] text-[10px] font-semibold"
          : compact
            ? "h-5 w-5 text-[10px] font-semibold"
            : "h-[26px] w-[26px] text-[11px] font-semibold"
      }`}
    >
      {number}
    </span>
  )
}

/**
 * The row's right-hand block: delta, time and place — or seed and seed rank — in fixed columns,
 * narrower when the roster summary itself is narrow (a `@container/summary` under 36rem, e.g. a phone).
 */
export function SummaryRowResult({
  result,
  compact,
  fluid = false,
}: {
  result: RowResult
  compact: boolean
  /** Columns narrowing with the roster summary (see fluidLength); fixed at full width otherwise. */
  fluid?: boolean
}) {
  const pill = compact ? "h-[18px] px-1.5 text-[10px]" : "h-5 px-[7px] text-[11px]"
  const width = (narrow: number, wide: number) => ({ width: fluid ? fluidLength(narrow, wide) : wide })
  const deltaWidth = compact ? width(52, 58) : width(56, 64)
  const timeWidth = compact ? width(64, 70) : width(68, 76)
  const placeWidth = compact ? width(36, 44) : width(40, 48)

  if (result.kind === "done") {
    const podium =
      result.podium && result.place != null && result.place >= 1 && result.place <= 3
        ? result.place
        : 0
    return (
      <span className="flex shrink-0 items-center tabular-nums">
        <span className="flex shrink-0 items-center justify-end" style={deltaWidth}>
          {result.delta ? (
            <span
              className={`inline-flex items-center rounded-full pt-[1.5px] font-mono font-medium leading-none ${pill} ${deltaPillClass(result.delta)}`}
            >
              {formatDelta(result.delta)}
            </span>
          ) : null}
        </span>
        <span
          style={timeWidth}
          className={`text-right font-mono font-semibold ${compact ? "text-[13px]" : "text-sm"} ${
            result.time ? "text-foreground" : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {result.time ? formatDisplayTime(result.time) : result.status ?? "—"}
        </span>
        <span
          style={placeWidth}
          className={`flex items-center justify-end text-foreground-secondary ${compact ? "text-[11px]" : "text-xs"}`}
        >
          {result.place != null ? (
            podium ? (
              <span
                className={`inline-flex items-center rounded-full pb-px font-semibold leading-none ${pill} ${PODIUM_PILL[podium]}`}
              >
                {formatOrdinal(result.place)}
              </span>
            ) : (
              <span className={compact ? "pr-1.5" : "pr-[7px]"}>{formatOrdinal(result.place)}</span>
            )
          ) : null}
        </span>
      </span>
    )
  }
  if (result.kind === "seed") {
    return (
      <span className="flex shrink-0 items-center tabular-nums">
        <span className="flex shrink-0 items-center justify-end" style={deltaWidth}>
          <span
            className={`inline-flex items-center rounded-full bg-fill-secondary pt-px font-sans font-semibold uppercase leading-none tracking-[0.1em] text-foreground-secondary dark:bg-fill ${
              compact ? "h-[18px] px-1.5 text-[9px]" : "h-5 px-[7px] text-[10px]"
            }`}
          >
            Seed
          </span>
        </span>
        <span
          style={timeWidth}
          className={`text-right font-mono font-normal text-foreground-secondary ${compact ? "text-[13px]" : "text-sm"}`}
        >
          {result.seed === "NT" ? "NT" : formatDisplayTime(result.seed)}
        </span>
        <span
          style={placeWidth}
          className={`flex items-center justify-end text-foreground-tertiary ${compact ? "text-[11px]" : "text-xs"}`}
        >
          {result.seedRank != null ? (
            <span className={compact ? "pr-1.5" : "pr-[7px]"}>{formatOrdinal(result.seedRank)}</span>
          ) : null}
        </span>
      </span>
    )
  }
  return (
    <span
      style={compact ? width(152, 172) : width(164, 188)}
      className={`shrink-0 text-right font-mono text-foreground-tertiary ${compact ? "text-[13px]" : "text-sm"}`}
    >
      —
    </span>
  )
}

/** "H11 of 20 · L6" breaking only between its " · " parts when it wraps. */
function nowrapParts(text: string): string {
  return text
    .split(" · ")
    .map((part) => part.replace(/ /g, "\u00a0"))
    .join(" · ")
}

export default function SummaryRow({
  id,
  display,
  eventNumber,
  avatar,
  label,
  shortLabel,
  shareShortLabel = false,
  sub,
  team,
  round,
  heatLane,
  startTime,
  legs,
  note,
  result,
  detail,
  trailing,
  onEdit,
  editLabel,
}: {
  id?: string
  display: RowDisplay
  eventNumber?: number
  avatar?: ReactNode
  label: ReactNode
  /** A shorter label ("400 Free A" for "400 Free Relay A") for when the label doesn't fit on its line. */
  shortLabel?: ReactNode
  /**
   * Whether the short label shows in step with the other rows sharing theirs (an athlete's preferred
   * name, once any athlete's name would wrap) rather than just when this row's label doesn't fit.
   */
  shareShortLabel?: boolean
  sub?: string
  /** Relay letter shown at the start of line two. */
  team?: string
  round?: string | null
  /** Heat & lane, compact ("H2 of 4 · L5"), in a column before the result. */
  heatLane?: string | null
  /** The heat's start time, under the heat & lane. */
  startTime?: string | null
  /** Relay swimmers in a two-up grid under the label, each after its leg number or stroke. */
  legs?: { tag: string; name: string; split?: string }[]
  note?: string
  result: RowResult
  detail: SwimDetail
  trailing?: ReactNode
  /** Coach edit action, offered from the detail modal instead of a row button. */
  onEdit?: () => void
  editLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const compact = display.density === "compact"
  // Beside the label rides the round, or (like the PDF) a relay leg & split when there's no round to
  // show; with a round, the leg & split go on the line below.
  const roundShown = display.showRound && Boolean(round)
  const besideLabel = roundShown ? round : team
  const showRound = Boolean(besideLabel)
  const teamBelow = roundShown ? team : undefined
  const showHL = display.showHeatLane && Boolean(heatLane || startTime)
  // How much of the row's detail has moved under the label (see RowFold): what this row needs to
  // keep its label whole, measured since it depends on the row's width (a phone has little room
  // beside the result columns), and shared with the other rows in a SummaryRowFold so they all
  // look alike. A label too long even alone wraps rather than being cut off.
  const rowKey = useId()
  const shared = useContext(RowFoldContext)
  const [ownFold, setOwnFold] = useState<RowFold>(0)
  const fold = shared ? shared.fold : ownFold
  // The right-hand columns sit centered beside everything while it fits there; once what's under the
  // label doesn't, they move up onto the first line and it runs on beneath them.
  const [ownFlow, setOwnFlow] = useState(false)
  const flow = shared ? shared.flow : ownFlow
  const [labelWraps, setLabelWraps] = useState(false)
  const [useShortLabel, setUseShortLabel] = useState(false)
  // Off-screen copies of both labels, so each can be measured whichever one is showing.
  const fullLabelRef = useRef<HTMLSpanElement>(null)
  const shortLabelRef = useRef<HTMLSpanElement>(null)
  const rowRef = useRef<HTMLLIElement>(null)
  const lineRef = useRef<HTMLSpanElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const roundRef = useRef<HTMLSpanElement>(null)
  const subRef = useRef<HTMLSpanElement>(null)
  const heatLaneRef = useRef<HTMLSpanElement>(null)
  const startTimeRef = useRef<HTMLSpanElement>(null)
  const teamRef = useRef<HTMLSpanElement>(null)
  const noteRef = useRef<HTMLSpanElement>(null)
  const legsRef = useRef<HTMLSpanElement>(null)
  const report = shared?.report
  const hlWidths = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const row = rowRef.current
    const line = lineRef.current
    const labelEl = labelRef.current
    if (!row || !line || !labelEl) return
    // Natural widths, even of text that's cut off (the round, tags and leg are always on one line).
    const width = (el: HTMLElement | null) => (el ? Math.max(el.scrollWidth, el.getBoundingClientRect().width) : 0)
    // The label and the heat & lane can wrap; then they're briefly unwrapped to measure, and the heat
    // & lane's width is kept so it isn't measured again.
    const unwrappedWidth = (el: HTMLElement) => {
      el.style.whiteSpace = "nowrap"
      const natural = width(el)
      el.style.whiteSpace = ""
      return natural
    }
    const labelWidth = () => (labelWraps ? unwrappedWidth(labelEl) : width(labelEl))
    const hlWidth = (el: HTMLElement | null) => {
      if (!el) return 0
      const key = `${el.textContent}|${compact}`
      let natural = hlWidths.current.get(key)
      if (natural == null) hlWidths.current.set(key, (natural = fold === 0 ? width(el) : unwrappedWidth(el)))
      return natural
    }
    const measure = () => {
      // Hidden (e.g. a collapsed section): nothing to fit.
      if (row.clientWidth === 0) return report?.(rowKey, null)
      const gap = parseFloat(getComputedStyle(line).columnGap) || 0
      const rowGap = parseFloat(getComputedStyle(row).columnGap) || 0
      const hlColumn = showHL ? Math.max(hlWidth(heatLaneRef.current), hlWidth(startTimeRef.current)) + rowGap : 0
      // The text column's width with the heat & lane in their column beside it, and without.
      const full = line.clientWidth + (fold === 0 ? hlColumn : 0)
      const besideHL = full - hlColumn
      const fits = (need: number, room: number) => need <= room + 0.5
      const others = subRef.current ? width(subRef.current) + gap : 0
      const roundWidth = showRound ? gap + width(roundRef.current) : 0
      const fullLabel = (shortLabel != null ? width(fullLabelRef.current) : labelWidth()) + others
      const need: RowFold = fits(fullLabel + roundWidth, besideHL) ? 0 : fits(fullLabel + roundWidth, full) ? 1 : 2
      // Then, once everything that can has moved below, a shorter label, and only then a wrapped one —
      // each step following on from the last as the row narrows, none undone by the next.
      const at = shared ? fold : need
      const room = at === 0 ? besideHL : full
      const beside = at === 2 ? 0 : roundWidth
      const wantsShort = shortLabel != null && !fits(fullLabel + beside, room)
      const short = shortLabel != null && (shareShortLabel && shared ? shared.shortLabels : wantsShort)
      setUseShortLabel(short)
      setLabelWraps(!fits((short ? width(shortLabelRef.current) + others : fullLabel) + beside, room))

      // What's under the label at its natural width, against the room beside the right-hand columns
      // (the first line's): the line below, each item after the first behind a 12px separator...
      const sum = (widths: number[], gapPx: number) => {
        const present = widths.filter((w) => w > 0)
        return present.reduce((a, b) => a + b, 0) + gapPx * Math.max(0, present.length - 1)
      }
      const line2Width = sum(
        [
          at === 2 && showRound ? width(roundRef.current) : 0,
          at >= 1 && showHL ? sum([hlWidth(heatLaneRef.current), hlWidth(startTimeRef.current)], 8) : 0,
          width(teamRef.current),
          width(noteRef.current),
        ],
        12
      )
      // ...and the relay swimmers, two to a row in columns up to 15rem wide.
      const legCells = [...(legsRef.current?.children ?? [])] as HTMLElement[]
      const columnMax = 15 * parseFloat(getComputedStyle(document.documentElement).fontSize)
      const legColumns = [0, 1].map((col) =>
        Math.min(
          columnMax,
          Math.max(
            0,
            ...legCells
              .filter((_, i) => i % 2 === col)
              .map((cell) => sum([...cell.children].map((part) => width(part as HTMLElement)), 6))
          )
        )
      )
      const wantsFlow = !fits(line2Width, line.clientWidth) || !fits(sum(legColumns, 16), line.clientWidth)

      if (report) report(rowKey, { fold: need, shortLabel: shareShortLabel && wantsShort, flow: wantsFlow })
      else {
        setOwnFold(need)
        setOwnFlow(wantsFlow)
      }
    }
    measureRef.current = measure
    measure()
  }, [
    shared,
    report,
    rowKey,
    fold,
    flow,
    labelWraps,
    compact,
    showRound,
    showHL,
    label,
    shortLabel,
    shareShortLabel,
    round,
    sub,
    team,
    heatLane,
    startTime,
  ])
  // Re-measured as the row resizes, applied before the frame is painted so a resize never shows a
  // frame of the old layout (labels cut off) before the new one.
  const measureRef = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    const observer = new ResizeObserver(() => flushSync(() => measureRef.current()))
    observer.observe(row)
    return () => observer.disconnect()
  }, [])
  useEffect(() => (report ? () => report(rowKey, null) : undefined), [report, rowKey])

  const hlInColumn = showHL && fold === 0
  const hlBelow = showHL && fold >= 1
  const roundInline = showRound && fold < 2
  const roundBelow = showRound && fold === 2
  const hlSize = compact ? "text-xs" : "text-[13px]"
  const columnGap = compact ? fluidLength(6, 10) : fluidLength(8, 12)
  const hlText = (
    <>
      {heatLane ? (
        <span ref={heatLaneRef} className="font-medium text-foreground">
          {nowrapParts(heatLane)}
        </span>
      ) : null}
      {startTime ? (
        <span ref={startTimeRef} className="whitespace-nowrap text-foreground-secondary">
          {startTime}
        </span>
      ) : null}
    </>
  )
  const roundEl = (
    <span
      ref={roundRef}
      className={`shrink-0 whitespace-nowrap text-foreground-tertiary ${compact ? "text-[11px]" : "text-xs"}`}
    >
      {besideLabel}
    </span>
  )

  // The line below the label: the round (or leg & split) if it didn't fit beside the label, the heat
  // & lane, a leg & split under a round, a note. It wraps between them if it must.
  const line2 = [
    roundBelow ? roundEl : null,
    hlBelow ? (
      <span className={`flex flex-wrap gap-x-2 tabular-nums ${hlSize}`}>
        {hlText}
      </span>
    ) : null,
    teamBelow ? (
      <span ref={teamRef} className="shrink-0 whitespace-nowrap">
        {team}
      </span>
    ) : null,
    note ? (
      <span ref={noteRef} className="min-w-0 truncate text-info">
        {note}
      </span>
    ) : null,
  ].filter(Boolean)
  const hasLine2 = line2.length > 0
  // Each item's separator sits in the space before it, which is clipped at the start of a line, so
  // a wrapped line doesn't begin with one.
  const details = hasLine2 ? (
    <span
      className={`min-w-0 overflow-hidden leading-[1.4] text-foreground-tertiary ${compact ? "text-[11px]" : "text-xs"}`}
    >
      <span className="-ml-3 flex flex-wrap items-baseline">
        {line2.map((item, i) => (
          <span
            key={i}
            className="relative flex min-w-0 items-baseline pl-3 before:absolute before:left-[4.5px] before:text-foreground-quaternary before:content-['|']"
          >
            {item}
          </span>
        ))}
      </span>
    </span>
  ) : null

  const firstLine = (
    <span ref={lineRef} className="flex min-w-0 flex-1 items-baseline gap-2">
      <span
        ref={labelRef}
        className={`min-w-0 font-medium tracking-[-0.005em] ${labelWraps ? "break-words" : "truncate"}`}
      >
        {useShortLabel ? shortLabel : label}
      </span>
      {shortLabel != null ? (
        <span aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden">
          <span ref={fullLabelRef} className="whitespace-nowrap font-medium tracking-[-0.005em]">
            {label}
          </span>
          <span ref={shortLabelRef} className="whitespace-nowrap font-medium tracking-[-0.005em]">
            {shortLabel}
          </span>
        </span>
      ) : null}
      {roundInline ? roundEl : null}
      {sub ? (
        <span ref={subRef} className="shrink-0 whitespace-nowrap text-xs text-foreground-tertiary">
          {sub}
        </span>
      ) : null}
    </span>
  )
  const belowFirstLine = (
    <>
      {details}
      {legs?.length ? (
        <span
          ref={legsRef}
          className={`grid grid-cols-[repeat(2,minmax(0,15rem))] gap-x-4 leading-[1.4] text-foreground-secondary ${
            compact ? "text-[11px]" : "text-xs"
          }`}
        >
          {legs.map((leg, i) => (
            <span key={`${i}-${leg.name}`} className="flex min-w-0 items-baseline gap-1.5">
              <span className="w-4 shrink-0 text-[9px] font-semibold tracking-[0.05em] text-foreground-tertiary">
                {leg.tag}
              </span>
              <span className="truncate">{leg.name}</span>
              {leg.split ? <span className="shrink-0 tabular-nums text-foreground-tertiary">{leg.split}</span> : null}
            </span>
          ))}
        </span>
      ) : null}
    </>
  )
  const rightColumns = (
    <>
      {hlInColumn ? (
        <span className={`flex shrink-0 flex-col items-end whitespace-nowrap leading-[1.35] tabular-nums ${hlSize}`}>
          {hlText}
        </span>
      ) : null}
      <SummaryRowResult result={result} compact={compact} fluid />
      {trailing ? (
        <span
          className="-ml-1 flex shrink-0 items-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {trailing}
        </span>
      ) : null}
    </>
  )

  useEffect(() => {
    if (!id) return
    const openIfHash = () => {
      if (hashMatchesId(id)) setOpen(true)
    }
    openIfHash()
    window.addEventListener("hashchange", openIfHash)
    return () => window.removeEventListener("hashchange", openIfHash)
  }, [id])

  return (
    <>
      <li
        id={id}
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen(true)
          }
        }}
        ref={rowRef}
        className={`flex cursor-pointer items-center border-t border-border-subtle leading-[1.3] text-foreground outline-none transition-colors duration-200 first:border-t-0 hover:text-accent focus-visible:bg-fill-secondary ${
          compact ? "py-[5px] text-[13px]" : "py-2.5 text-sm"
        }`}
        style={{
          paddingLeft: SUMMARY_INSET,
          paddingRight: compact ? fluidLength(8, 14) : fluidLength(10, 14),
          columnGap,
        }}
      >
        {eventNumber ? <EventBadge number={eventNumber} compact={compact} /> : null}
        {avatar}
        {flow ? (
          // The right-hand columns on the first line, with everything under it running beneath them.
          <span className={`flex min-w-0 flex-1 flex-col ${compact ? "gap-0" : "gap-0.5"}`}>
            <span className="flex items-center" style={{ columnGap }}>
              {firstLine}
              {rightColumns}
            </span>
            {belowFirstLine}
          </span>
        ) : (
          // The right-hand columns centered beside all of it.
          <>
            <span className={`flex min-w-0 flex-1 flex-col justify-center ${compact ? "gap-0" : "gap-0.5"}`}>
              {firstLine}
              {belowFirstLine}
            </span>
            {rightColumns}
          </>
        )}
      </li>
      {open ? (
        <SwimDetailModal
          detail={detail}
          onClose={() => setOpen(false)}
          editLabel={editLabel}
          onEdit={
            onEdit
              ? () => {
                  setOpen(false)
                  onEdit()
                }
              : undefined
          }
        />
      ) : null}
    </>
  )
}
