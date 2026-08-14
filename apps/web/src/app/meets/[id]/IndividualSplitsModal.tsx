"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import type { ResultSplit } from "@/lib/meet-sheet-summary"
import {
  formatDisplayTime,
  formatSeedTimeDelta,
  formatOrdinal,
  podiumPlaceClass,
} from "@/lib/utils"
import { sanitizeRelaySplitTime } from "@/lib/relay-results"
import { athletePath } from "@/lib/slug"

export type ResultRoundSection = {
  label: string
  time?: string
  place?: number
  status?: string
  heat?: string
  lane?: number
  splits: ResultSplit[]
  seedTime?: string
  seedRank?: number | string
}

function RoundSection({ round }: { round: ResultRoundSection }) {
  const rows = [...round.splits].sort((a, b) => a.distance - b.distance)
  const delta =
    round.seedTime && round.time
      ? formatSeedTimeDelta(round.seedTime, round.time)
      : null
  const isDrop = delta?.startsWith("-")

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-foreground-tertiary">
          {round.label}
        </h3>
        {(round.time || round.status) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {round.time ? (
              <span className="font-mono text-lg text-foreground">
                {formatDisplayTime(round.time)}
              </span>
            ) : (
              <span className="text-lg font-medium text-foreground">{round.status}</span>
            )}
            {delta ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-mono font-medium ${
                  isDrop
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                    : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                }`}
              >
                {delta}
              </span>
            ) : null}
            {round.place != null ? (
              <span
                className={
                  round.place >= 1 && round.place <= 3
                    ? `font-medium ${podiumPlaceClass(round.place)}`
                    : "font-medium text-foreground text-opacity-70"
                }
              >
                {formatOrdinal(round.place)}
              </span>
            ) : null}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-secondary">
          {round.seedTime && round.time ? (
            <span className="flex items-center gap-1.5">
              <span className="text-foreground-tertiary">Seed:</span>
              {formatDisplayTime(round.seedTime)}
              {round.seedRank != null ? ` #${round.seedRank}` : ""}
            </span>
          ) : null}
          {round.heat ? (
            <span className="flex items-center gap-1.5">
              <span className="text-foreground-tertiary">Heat</span> {round.heat}
            </span>
          ) : null}
          {round.lane != null ? (
            <span className="flex items-center gap-1.5">
              <span className="text-foreground-tertiary">Lane</span> {round.lane}
            </span>
          ) : null}
        </div>
      </div>

      {rows.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-border divide-y divide-border">
          <li className="grid grid-cols-[4.5rem_1fr] gap-2 bg-background/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-tertiary">
            <span>Distance</span>
            <span className="text-right">Split</span>
          </li>
          {rows.map((split) => {
            const time = sanitizeRelaySplitTime(split.splitTime)
            return (
              <li
                key={`${round.label}-${split.distance}`}
                className="grid grid-cols-[4.5rem_1fr] items-center gap-2 px-3 py-2.5 text-sm"
              >
                <span className="text-foreground">{split.distance}</span>
                <span className="font-mono text-right text-foreground">
                  {time ? formatDisplayTime(time) : ""}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

export default function IndividualSplitsModal({
  athleteName,
  athleteId,
  athleteSlug,
  title,
  timeDisplay,
  splits,
  onClose,
  swimInfo,
  rawTime,
  rounds,
}: {
  athleteName?: string
  athleteId?: string
  athleteSlug?: string | null
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
  /** When set (e.g. prelims + finals), render each round in one modal. */
  rounds?: ResultRoundSection[]
}) {
  const [mounted, setMounted] = useState(false)
  const multiRound = (rounds?.length ?? 0) > 1
  const singleRound = rounds?.length === 1 ? rounds[0] : null
  const legacyRows = [...splits].sort((a, b) => a.distance - b.distance)
  const isPendingEntry =
    !multiRound &&
    !rawTime &&
    !singleRound?.time &&
    !singleRound?.status &&
    singleRound?.place == null &&
    swimInfo?.resultPlace == null &&
    !singleRound?.splits.length &&
    legacyRows.length === 0

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
        className="relative z-10 flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-5 pb-1">
          {athleteName ? (
            athleteId ? (
              <Link
                href={athletePath(athleteSlug ?? athleteId ?? "")}
                className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                onClick={onClose}
              >
                {athleteName}
              </Link>
            ) : (
              <p className="text-sm font-medium text-foreground">{athleteName}</p>
            )
          ) : null}
          <h2
            className={`text-lg font-semibold tracking-tight text-foreground ${
              athleteName ? "mt-0.5" : ""
            }`}
          >
            {title}
          </h2>

          {!multiRound ? (
            <>
              {(rawTime || singleRound?.time || timeDisplay) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-lg text-foreground">
                    {rawTime ??
                      (singleRound?.time
                        ? formatDisplayTime(singleRound.time)
                        : timeDisplay)}
                  </span>
                  {isPendingEntry && (singleRound?.heat ?? swimInfo?.heat) && (
                    <span className="flex items-center gap-1.5 text-sm text-foreground-secondary">
                      <span className="text-foreground-tertiary">Heat</span>{" "}
                      {singleRound?.heat ?? swimInfo?.heat}
                    </span>
                  )}
                  {isPendingEntry && (singleRound?.lane ?? swimInfo?.lane) != null && (
                    <span className="flex items-center gap-1.5 text-sm text-foreground-secondary">
                      <span className="text-foreground-tertiary">Lane</span>{" "}
                      {singleRound?.lane ?? swimInfo?.lane}
                    </span>
                  )}

                  {(() => {
                    const seed = singleRound?.seedTime ?? swimInfo?.seedTime
                    const time = rawTime ?? singleRound?.time
                    const delta =
                      seed && time ? formatSeedTimeDelta(seed, time) : null
                    if (!delta) return null
                    const isDrop = delta.startsWith("-")
                    return (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-mono font-medium ${
                          isDrop
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                        }`}
                      >
                        {delta}
                      </span>
                    )
                  })()}
                  {(singleRound?.place ?? swimInfo?.resultPlace) != null && (
                    <span
                      className={
                        (singleRound?.place ?? swimInfo?.resultPlace)! >= 1 &&
                        (singleRound?.place ?? swimInfo?.resultPlace)! <= 3
                          ? `font-medium ${podiumPlaceClass(
                              (singleRound?.place ?? swimInfo?.resultPlace)!
                            )}`
                          : "font-medium text-foreground text-opacity-70"
                      }
                    >
                      {formatOrdinal(
                        (singleRound?.place ?? swimInfo?.resultPlace)!
                      )}
                    </span>
                  )}
                </div>
              )}
              {!isPendingEntry && (singleRound || swimInfo) && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground-secondary">
                  {(singleRound?.seedTime ?? swimInfo?.seedTime) &&
                    (singleRound?.time ||
                      swimInfo?.time ||
                      swimInfo?.resultPlace ||
                      singleRound?.place) && (
                      <span className="flex items-center gap-1.5">
                        <span className="text-foreground-tertiary">Seed:</span>
                        {formatDisplayTime(
                          (singleRound?.seedTime ?? swimInfo?.seedTime)!
                        )}
                        {(singleRound?.seedRank ?? swimInfo?.rank) != null
                          ? ` #${singleRound?.seedRank ?? swimInfo?.rank}`
                          : ""}
                      </span>
                    )}
                  {(singleRound?.heat ?? swimInfo?.heat) && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-foreground-tertiary">Heat</span>{" "}
                      {singleRound?.heat ?? swimInfo?.heat}
                    </span>
                  )}
                  {(singleRound?.lane ?? swimInfo?.lane) != null && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-foreground-tertiary">Lane</span>{" "}
                      {singleRound?.lane ?? swimInfo?.lane}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-3 empty:flex-none empty:h-2 empty:p-0">
          {multiRound ? (
            <div className="space-y-4">
              {rounds!.map((round) => (
                <RoundSection key={round.label} round={round} />
              ))}
            </div>
          ) : (singleRound?.splits.length ? singleRound.splits : legacyRows).length >
            0 ? (
            <ul className="overflow-hidden rounded-lg border border-border divide-y divide-border">
              <li className="grid grid-cols-[4.5rem_1fr] gap-2 bg-background/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-tertiary">
                <span>Distance</span>
                <span className="text-right">Split</span>
              </li>
              {(singleRound?.splits.length
                ? [...singleRound.splits].sort((a, b) => a.distance - b.distance)
                : legacyRows
              ).map((split) => {
                const time = sanitizeRelaySplitTime(split.splitTime)
                return (
                  <li
                    key={split.distance}
                    className="grid grid-cols-[4.5rem_1fr] items-center gap-2 px-3 py-2.5 text-sm"
                  >
                    <span className="text-foreground">{split.distance}</span>
                    <span className="font-mono text-right text-foreground">
                      {time ? formatDisplayTime(time) : ""}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>

        <div
          className="shrink-0 border-t border-border px-6 py-3"
          style={{ borderColor: "var(--brand-color-border-subtle)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-fill"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
