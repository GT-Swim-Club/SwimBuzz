"use client"

import { useMemo, type CSSProperties } from "react"
import Link from "next/link"
import { currentSeason, seasonFromDate } from "@swimbuzz/shared"
import { formatSwimDate, formatTime } from "@/lib/utils"
import {
  compareSwimsChronologically,
  compareSwimsNewestFirst,
  formatTimeDelta,
  isDeletableSwim,
  relaySplitLegLabel,
  swimFlagLabel,
  swimMeetHref,
  type AthleteSwim,
  type SwimMarks,
} from "@/lib/athlete/swim-history"
import DeleteSwimButton from "./DeleteSwimButton"
import ProgressionChart from "./ProgressionChart"
import { DeltaPill, PbBadge } from "./SwimMarks"

const COLS_COACH =
  "grid-cols-[var(--time-w)_44px_72px_minmax(0,1fr)_112px_28px] max-[600px]:grid-cols-[76px_36px_60px_minmax(0,1fr)_28px]"
const COLS_ATHLETE =
  "grid-cols-[var(--time-w)_44px_72px_minmax(0,1fr)_112px] max-[600px]:grid-cols-[76px_36px_60px_minmax(0,1fr)]"

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

const VIEWS = [
  { splits: false, label: "Flat start" },
  { splits: true, label: "Relay splits" },
] as const

/** Flat start | Relay splits, for an event the athlete has both of. */
function ViewSwitch({ splits, onChange }: { splits: boolean; onChange: (splits: boolean) => void }) {
  return (
    <div
      role="group"
      aria-label="Times shown"
      className="relative grid h-9 w-[248px] max-w-full grid-cols-2 rounded-lg border border-border-secondary bg-fill-secondary p-0.5"
    >
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 w-[calc((100%-4px)/2)] rounded-md bg-primary-bg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand-color-primary)_25%,transparent)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${splits ? 100 : 0}%)` }}
      />
      {VIEWS.map((view) => {
        const on = view.splits === splits
        return (
          <button
            key={view.label}
            type="button"
            onClick={() => onChange(view.splits)}
            aria-pressed={on}
            className={`relative z-[1] rounded-md text-[13px] font-medium transition-colors ${
              on ? "text-accent" : "text-foreground-secondary hover:text-foreground"
            }`}
          >
            {view.label}
          </button>
        )
      })}
    </div>
  )
}

/** One event + course: PB, progression chart, and every swim of it, or every relay split in it. */
export default function EventDrilldown({
  event,
  course,
  swims,
  marks,
  splits = false,
  relaySplits = [],
  onViewChange,
  isCoach,
  onBack,
}: {
  event: string
  course: string
  /** Flat-start swims, or relay splits when `splits`. */
  swims: AthleteSwim[]
  marks: SwimMarks
  /** Show the event's relay splits (legs 2–4) rather than its flat-start swims. */
  splits?: boolean
  /** The athlete's relay splits, which the flat-start chart can show alongside its swims. */
  relaySplits?: AthleteSwim[]
  /** Set when the athlete has both views of this event, to switch between them. */
  onViewChange?: (splits: boolean) => void
  isCoach: boolean
  onBack: () => void
}) {
  const sel = useMemo(
    () => swims.filter((s) => s.event === event && s.course === course),
    [swims, event, course]
  )
  const overlaySel = useMemo(
    () => (splits ? [] : relaySplits.filter((s) => s.event === event && s.course === course)),
    [splits, relaySplits, event, course]
  )
  const chrono = useMemo(() => [...sel].sort(compareSwimsChronologically), [sel])
  const rows = useMemo(() => [...sel].sort(compareSwimsNewestFirst), [sel])

  const pb = sel.reduce<AthleteSwim | null>((best, s) => (!best || s.timeMs < best.timeMs ? s : best), null)
  const season = currentSeason()
  const seasonTimes = sel.filter((s) => seasonFromDate(s.date.slice(0, 10)) === season).map((s) => s.timeMs)
  const seasonBest = seasonTimes.length ? Math.min(...seasonTimes) : null
  const drop = pb && chrono.length > 1 ? chrono[0]!.timeMs - pb.timeMs : 0

  const longestTime = rows.reduce((m, s) => Math.max(m, formatTime(s.timeMs).length), 0)
  const tableStyle = { "--time-w": `${Math.max(40, Math.ceil(longestTime * 8.5) + 2)}px` } as CSSProperties
  // The delete column only earns its space when one of these swims can be deleted.
  const showDelete = isCoach && rows.some(isDeletableSwim)
  const cols = showDelete ? COLS_COACH : COLS_ATHLETE

  if (!pb) return null
  const pbHref = swimMeetHref(pb)

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
        {onViewChange && (
          <div className="mb-4">
            <ViewSwitch splits={splits} onChange={onViewChange} />
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xs font-medium uppercase leading-4 tracking-wide text-foreground-secondary">
              {event} · {course} · {splits ? "Relay split best" : "Personal best"}
            </h2>
            <p className="mt-1.5 font-mono text-[44px] font-semibold leading-[48px] tracking-[-0.02em] tabular-nums">
              {formatTime(pb.timeMs)}
            </p>
            <p className="mt-1 truncate text-sm text-foreground-secondary">
              {formatSwimDate(pb.date)}
              {pb.meet && (
                <>
                  {" · "}
                  {pbHref ? (
                    <Link href={pbHref} className="transition-colors hover:text-primary">
                      {pb.meet}
                    </Link>
                  ) : (
                    pb.meet
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-7 text-right max-[600px]:gap-5 max-[600px]:text-left">
            <Stat label={splits ? "Splits" : "Swims"} value={String(sel.length)} />
            <Stat label={`${shortSeason(season)} best`} value={seasonBest == null ? "—" : formatTime(seasonBest)} />
            <Stat label="Dropped" value={drop > 0 ? `−${formatTimeDelta(drop)}` : "—"} />
          </div>
        </div>

        <ProgressionChart
          swims={sel}
          overlay={overlaySel}
          marks={marks}
          pbId={pb.id}
          splits={splits}
        />
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
            const flags = swim.relaySplit ? relaySplitLegLabel(swim.relaySplit) : swimFlagLabel(swim.tags)
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
                <span className="flex">
                  <DeltaPill delta={marks.improvement.get(swim.id) ?? null} />
                </span>
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
