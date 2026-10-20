import { formatImprovement } from "@/lib/athlete/swim-history"
import HoverDetail from "@/components/ui/HoverDetail"
import { deltaPillClass, formatDelta } from "@/app/meets/[id]/SwimDetailModal"

/**
 * "PB" chip — filled for the current best, outlined for a swim that was a PB at the time.
 * This and ImprovementCell sit at z-[1], above the drill-down row's link overlay, so their hover details show.
 */
export function PbBadge({ current }: { current: boolean }) {
  return current ? (
    <span
      className="relative z-[1] rounded-md border border-transparent bg-primary-bg px-[7px] py-px text-xs font-bold leading-[18px] tracking-[0.04em] text-accent"
    >
      PB
      <HoverDetail label="Current personal best" />
    </span>
  ) : (
    <span
      className="relative z-[1] rounded-md border border-border px-[7px] py-px text-xs font-semibold leading-[18px] tracking-[0.04em] text-foreground-tertiary"
    >
      PB
      <HoverDetail label="Personal best at the time" />
    </span>
  )
}

/** Time vs. the best before this swim: green when faster, red when slower. */
export function ImprovementCell({ delta }: { delta: number | null }) {
  return (
    <span
      className={`relative z-[1] font-mono tabular-nums ${
        delta == null
          ? "text-foreground-tertiary"
          : delta < 0
            ? "text-success"
            : delta > 0
              ? "text-red-800 dark:text-red-300"
              : "text-foreground-tertiary"
      }`}
    >
      {formatImprovement(delta)}
      <HoverDetail label={delta == null ? "First swim of this event" : "Compared with the best time before this swim"} />
    </span>
  )
}

/** Same delta pill as meet result rows: green when faster, red when slower; nothing for an event's first swim. */
export function DeltaPill({ delta }: { delta: number | null }) {
  if (delta == null) return null
  const text = formatImprovement(delta)
  return (
    <span
      className={`relative z-[1] inline-flex h-[22px] items-center rounded-full px-2 pt-[1.5px] font-mono text-xs font-medium leading-none tabular-nums ${deltaPillClass(text)}`}
    >
      {formatDelta(text)}
      <HoverDetail label="Compared with the best time before this swim" />
    </span>
  )
}
