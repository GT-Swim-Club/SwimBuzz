"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import type { ResultSplit } from "@/lib/meet-sheet-summary"
import { formatDisplayTime, formatSeedTimeDelta, formatOrdinal, podiumPlaceClass } from "@/lib/utils"
import { sanitizeRelaySplitTime } from "@/lib/relay-results"

export default function IndividualSplitsModal({
  athleteName,
  athleteId,
  title,
  timeDisplay,
  splits,
  onClose,
  swimInfo,
  rawTime,
}: {
  athleteName?: string
  athleteId?: string
  title: string
  timeDisplay?: ReactNode
  splits: ResultSplit[]
  onClose: () => void
  swimInfo?: {
    seedTime?: string
    rank?: number | string
    heat?: number | string
    lane?: number
    resultPlace?: number
    time?: string
    rawTime?: string
  }
  rawTime?: string
}) {
  const [mounted, setMounted] = useState(false)
  const rows = [...splits].sort((a, b) => a.distance - b.distance)

  useEffect(() => setMounted(true), [])

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

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        className="relative z-10 flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border border-border-secondary-secondary border-border-secondary-secondary bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-2">
          {athleteName ? (
            athleteId ? (
              <Link 
                href={`/athletes/${athleteId}`}
                className="text-sm font-medium text-foreground dark:text-foreground hover:text-primary transition-colors"
                onClick={onClose}
              >
                {athleteName}
              </Link>
            ) : (
              <p className="text-sm font-medium text-foreground dark:text-foreground">{athleteName}</p>
            )
          ) : null}
          <h2
            className={`text-lg font-medium text-foreground dark:text-foreground ${
              athleteName ? "mt-0.5" : ""
            }`}
          >
            {title}
          </h2>
          {(rawTime || timeDisplay) ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-foreground dark:text-foreground font-mono text-lg">{rawTime ?? timeDisplay}</span>
              {(() => {
                const delta = swimInfo?.seedTime && rawTime ? formatSeedTimeDelta(swimInfo.seedTime, rawTime) : null;
                if (!delta) return null;
                const isDrop = delta.startsWith("-");
                return (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-mono font-medium ${
                    isDrop 
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                  }`}>
                    {delta}
                  </span>
                );
              })()}
              {swimInfo?.resultPlace && (
                <span className={swimInfo.resultPlace >= 1 && swimInfo.resultPlace <= 3 ? `font-medium ${podiumPlaceClass(swimInfo.resultPlace)}` : "text-foreground text-opacity-70 dark:text-foreground dark:text-opacity-70 font-medium"}>
                  {formatOrdinal(swimInfo.resultPlace)}
                </span>
              )}
            </div>
          ) : null}
          {swimInfo && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-secondary">
              {swimInfo.seedTime && (swimInfo.time || swimInfo.resultPlace) && (
                <span className="flex items-center gap-1.5">
                  <span className="text-foreground-tertiary">Seed:</span>
                  {formatDisplayTime(swimInfo.seedTime)}
                  {swimInfo.rank && ` #${swimInfo.rank}`}
                </span>
              )}
              {swimInfo.heat && <span className="flex items-center gap-1.5"><span className="text-foreground-tertiary">Heat</span> {swimInfo.heat}</span>}
              {swimInfo.lane != null && <span className="flex items-center gap-1.5"><span className="text-foreground-tertiary">Lane</span> {swimInfo.lane}</span>}
            </div>
          )}
        </div>

        {splits.length > 0 && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <ul className="bg-background divide-y dark:divide-zinc-800 border border-border border-border-secondary-secondary rounded-lg dark:border-zinc-800 overflow-hidden">
              <li className="grid grid-cols-[4.5rem_1fr] gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-tertiary dark:text-foreground-tertiary bg-background/50">
                <span>Distance</span>
                <span className="text-right">Split</span>
              </li>
              {rows.map((split) => {
                const time = sanitizeRelaySplitTime(split.splitTime)
                return (
                  <li
                    key={split.distance}
                    className="grid grid-cols-[4.5rem_1fr] gap-2 px-3 py-2.5 text-sm items-center"
                  >
                    <span className="text-foreground dark:text-foreground">{split.distance}</span>
                    <span className="font-mono text-right text-foreground dark:text-foreground">
                      {time ? formatDisplayTime(time) : ""}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="bg-background shrink-0 border-t px-6 py-4" style={{ borderColor: 'var(--brand-color-border-subtle)' }}>
          <button
            type="button"
            onClick={onClose}
            className="bg-background w-full rounded-lg border border-border border-border-secondary-secondary border-border-secondary-secondary px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
