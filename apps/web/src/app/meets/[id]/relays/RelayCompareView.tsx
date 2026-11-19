"use client"

import { formatLegTime, formatTimeDiff, type LineupTeam } from "@/lib/meet/relay-builder"

/** One side of a comparison: a lineup with the times it was saved with. */
export type CompareSide = {
  /** "Draft", "Published", "Optimal (1Y)", … */
  label: string
  /** Who saved it and when, if known. */
  detail?: string | null
  /** The builder settings it was made with, in brief ("Times 1Y · 24 athletes"); null when unknown. */
  settings?: string | null
  teams: LineupTeam[]
}

function totalOf(team: LineupTeam | undefined): number | null {
  if (!team || team.legs.length === 0) return null
  return team.legs.every((leg) => leg.timeMs != null)
    ? team.legs.reduce((sum, leg) => sum + (leg.timeMs ?? 0), 0)
    : null
}

function SideHeading({ side, settingsDiffer }: { side: CompareSide; settingsDiffer: boolean }) {
  return (
    <div className="min-w-0 px-3 py-1.5">
      <p className="truncate text-xs font-medium text-foreground">{side.label}</p>
      {side.detail ? <p className="truncate text-[11px] text-foreground-secondary">{side.detail}</p> : null}
      {side.settings ? (
        <p
          title={settingsDiffer ? "Built with different settings from the other lineup" : undefined}
          className={`truncate text-[11px] ${settingsDiffer ? "font-medium text-accent" : "text-foreground-secondary"}`}
        >
          {side.settings}
        </p>
      ) : null}
    </div>
  )
}

function LegCell({
  leg,
  stroke,
  changed,
}: {
  leg: LineupTeam["legs"][number] | undefined
  stroke?: string
  changed: boolean
}) {
  return (
    <div className={`flex min-w-0 items-center justify-between gap-2 px-3 py-1.5 ${changed ? "bg-primary/10" : ""}`}>
      <div className="min-w-0">
        <p className={`truncate text-sm font-medium ${leg ? (changed ? "text-accent" : "text-foreground") : "text-foreground-tertiary"}`}>
          {leg?.name ?? "—"}
        </p>
        {stroke ? <p className="truncate text-xs text-foreground-secondary">{stroke}</p> : null}
      </div>
      {leg ? (
        <span className={`shrink-0 font-mono text-[13px] tabular-nums ${leg.timeMs == null ? "text-error" : "text-foreground"}`}>
          {formatLegTime(leg.timeMs ?? null)}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Two lineups of a relay event side by side, read-only: each relay letter is a card with a column
 * per lineup, swimmers who differ highlighted, and the right side's time against the left's.
 */
export default function RelayCompareView({
  left,
  right,
  legLabels,
  onLoadRight,
  onClose,
  loadDisabled = false,
  relayTitle = (letter) => `${letter} Relay`,
}: {
  left: CompareSide
  right: CompareSide
  /** Stroke or distance per leg ("50 Back"), from the build on screen. */
  legLabels: string[]
  onLoadRight: () => void
  onClose: () => void
  loadDisabled?: boolean
  /** A card's title from its key — e.g. "A-P" → "A Relay · Prelims" when both rounds are compared. */
  relayTitle?: (letter: string) => string
}) {
  // Keys sort by letter, then prelims ("-P") before finals ("-F").
  const sortKey = (letter: string) => letter.replace(/-F$/, "-Q")
  const letters = [...new Set([...left.teams, ...right.teams].map((team) => team.letter))].sort((a, b) =>
    sortKey(a).localeCompare(sortKey(b))
  )
  /** Both sides' settings are known and differ: they're highlighted, as their times aren't like for like. */
  const settingsDiffer = left.settings != null && right.settings != null && left.settings !== right.settings

  return (
    <section aria-label="Compare lineups" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-sm text-foreground-secondary">
          Comparing <span className="font-medium text-foreground">{left.label}</span> with{" "}
          <span className="font-medium text-foreground">{right.label}</span>
          {settingsDiffer ? <span className="text-accent"> · built with different settings</span> : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onLoadRight}
            disabled={loadDisabled}
            className="h-9 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load {right.label}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-fill"
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {letters.map((letter) => {
          const a = left.teams.find((team) => team.letter === letter)
          const b = right.teams.find((team) => team.letter === letter)
          const legCount = Math.max(a?.legs.length ?? 0, b?.legs.length ?? 0, legLabels.length)
          const totalA = totalOf(a)
          const totalB = totalOf(b)
          const diff = totalA != null && totalB != null ? totalB - totalA : null
          return (
            <div key={letter} className="min-w-0 rounded-lg border border-border bg-background">
              <div className="flex items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5 text-[15px] font-medium text-foreground">
                <span>{relayTitle(letter)}</span>
                {diff != null && diff !== 0 ? (
                  <span
                    title={`${right.label} against ${left.label}`}
                    className={`font-mono text-xs tabular-nums ${diff < 0 ? "text-success-text" : "text-error"}`}
                  >
                    {formatTimeDiff(diff)}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
                <SideHeading side={left} settingsDiffer={settingsDiffer} />
                <SideHeading side={right} settingsDiffer={settingsDiffer} />
              </div>
              {Array.from({ length: legCount }, (_, i) => {
                const legA = a?.legs[i]
                const legB = b?.legs[i]
                const changed = (legA?.athleteId ?? null) !== (legB?.athleteId ?? null)
                return (
                  <div key={i} className="grid grid-cols-2 divide-x divide-border border-b border-border">
                    <LegCell leg={legA} stroke={legLabels[i]} changed={changed} />
                    <LegCell leg={legB} stroke={legLabels[i]} changed={changed} />
                  </div>
                )
              })}
              <div className="grid grid-cols-2 divide-x divide-border text-sm font-medium">
                {[totalA, totalB].map((total, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-foreground-secondary">Total</span>
                    <span className="font-mono tabular-nums text-foreground">
                      {(i === 0 ? a : b) ? formatLegTime(total) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
