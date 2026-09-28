"use client"

import { useEffect, useState, type ReactNode } from "react"
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

function hashMatchesId(id: string) {
  const hashes = window.location.hash.split("#").filter(Boolean)
  return hashes[hashes.length - 1] === id
}

function Sep() {
  return <span className="-mx-0.5 text-foreground-quaternary">|</span>
}

export function EventBadge({ number, compact }: { number: number; compact: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/10 font-semibold tabular-nums text-accent ${
        compact ? "h-5 w-5 text-[10px]" : "h-[26px] w-[26px] text-[11px]"
      }`}
    >
      {number}
    </span>
  )
}

export default function SummaryRow({
  id,
  display,
  eventNumber,
  avatar,
  label,
  sub,
  team,
  round,
  heatLane,
  note,
  result,
  detail,
  trailing,
  onEditRelay,
}: {
  id?: string
  display: RowDisplay
  eventNumber?: number
  avatar?: ReactNode
  label: ReactNode
  sub?: string
  /** Relay letter shown at the start of line two. */
  team?: string
  round?: string | null
  heatLane?: string | null
  note?: string
  result: RowResult
  detail: SwimDetail
  trailing?: ReactNode
  onEditRelay?: () => void
}) {
  const [open, setOpen] = useState(false)
  const compact = display.density === "compact"
  const showRound = display.showRound && Boolean(round)
  const showHL = display.showHeatLane && Boolean(heatLane)
  const hasLine2 = Boolean(team) || showRound || showHL || Boolean(note)

  useEffect(() => {
    if (!id) return
    const openIfHash = () => {
      if (hashMatchesId(id)) setOpen(true)
    }
    openIfHash()
    window.addEventListener("hashchange", openIfHash)
    return () => window.removeEventListener("hashchange", openIfHash)
  }, [id])

  const pill = compact ? "h-[18px] px-1.5 text-[10px]" : "h-5 px-[7px] text-[11px]"

  let right: ReactNode = null
  if (result.kind === "done") {
    const podium =
      result.podium && result.place != null && result.place >= 1 && result.place <= 3
        ? result.place
        : 0
    right = (
      <span className="flex shrink-0 items-center tabular-nums">
        <span className={`flex shrink-0 items-center justify-end ${compact ? "w-[58px]" : "w-16"}`}>
          {result.delta ? (
            <span
              className={`inline-flex items-center rounded-full pt-[1.5px] font-mono font-medium leading-none ${pill} ${deltaPillClass(result.delta)}`}
            >
              {formatDelta(result.delta)}
            </span>
          ) : null}
        </span>
        <span
          className={`text-right font-mono font-semibold ${compact ? "w-[70px] text-[13px]" : "w-[76px] text-sm"} ${
            result.time ? "text-foreground" : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {result.time ? formatDisplayTime(result.time) : result.status ?? "—"}
        </span>
        <span
          className={`flex items-center justify-end text-foreground-secondary ${compact ? "w-11 text-[11px]" : "w-12 text-xs"}`}
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
  } else if (result.kind === "seed") {
    right = (
      <span className="flex shrink-0 items-center tabular-nums">
        <span className={`flex shrink-0 items-center justify-end ${compact ? "w-[58px]" : "w-16"}`}>
          <span
            className={`inline-flex items-center rounded-full bg-fill-secondary pt-px font-sans font-semibold uppercase leading-none tracking-[0.1em] text-foreground-secondary dark:bg-fill ${
              compact ? "h-[18px] px-1.5 text-[9px]" : "h-5 px-[7px] text-[10px]"
            }`}
          >
            Seed
          </span>
        </span>
        <span
          className={`text-right font-mono font-normal text-foreground-secondary ${compact ? "w-[70px] text-[13px]" : "w-[76px] text-sm"}`}
        >
          {result.seed === "NT" ? "NT" : formatDisplayTime(result.seed)}
        </span>
        <span
          className={`flex items-center justify-end text-foreground-tertiary ${compact ? "w-11 text-[11px]" : "w-12 text-xs"}`}
        >
          {result.seedRank != null ? (
            <span className={compact ? "pr-1.5" : "pr-[7px]"}>{formatOrdinal(result.seedRank)}</span>
          ) : null}
        </span>
      </span>
    )
  } else {
    right = (
      <span
        className={`shrink-0 text-right font-mono text-foreground-tertiary ${compact ? "w-[172px] text-[13px]" : "w-[188px] text-sm"}`}
      >
        —
      </span>
    )
  }

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
        className={`flex cursor-pointer items-center border-t border-border-subtle leading-[1.3] text-foreground outline-none transition-colors duration-200 first:border-t-0 hover:text-accent focus-visible:bg-fill-secondary ${
          compact ? "gap-2.5 py-[5px] pl-4 pr-3.5 text-[13px]" : "gap-3 py-2.5 pl-4 pr-3.5 text-sm"
        }`}
      >
        {eventNumber ? <EventBadge number={eventNumber} compact={compact} /> : null}
        {avatar}
        <span
          className={`flex min-w-0 flex-1 flex-col justify-center ${compact ? "gap-0" : "gap-0.5"}`}
          style={{ minHeight: hasLine2 ? (compact ? 33 : 37) : 0 }}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-medium tracking-[-0.005em]">{label}</span>
            {sub ? (
              <span className="shrink-0 whitespace-nowrap text-xs text-foreground-tertiary">{sub}</span>
            ) : null}
          </span>
          {hasLine2 ? (
            <span
              className={`flex min-w-0 gap-1.5 overflow-hidden whitespace-nowrap leading-[1.4] text-foreground-tertiary ${
                compact ? "text-[11px]" : "text-xs"
              }`}
            >
              {team ? <span className="shrink-0">{team}</span> : null}
              {team && (showRound || showHL) ? <Sep /> : null}
              {showRound ? <span className="shrink-0">{round}</span> : null}
              {showRound && showHL ? <Sep /> : null}
              {showHL ? <span className="truncate">{heatLane}</span> : null}
              {note ? (
                <>
                  {team || showRound || showHL ? <Sep /> : null}
                  <span className="truncate text-info">{note}</span>
                </>
              ) : null}
            </span>
          ) : null}
        </span>
        {right}
        {trailing ? (
          <span
            className="-ml-1 flex shrink-0 items-center"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {trailing}
          </span>
        ) : null}
      </li>
      {open ? (
        <SwimDetailModal
          detail={detail}
          onClose={() => setOpen(false)}
          onEditRelay={
            onEditRelay
              ? () => {
                  setOpen(false)
                  onEditRelay()
                }
              : undefined
          }
        />
      ) : null}
    </>
  )
}
