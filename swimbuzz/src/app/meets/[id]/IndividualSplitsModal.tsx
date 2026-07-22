"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { ResultSplit } from "@/lib/meet-sheet-summary"
import { formatDisplayTime } from "@/lib/utils"
import { sanitizeRelaySplitTime } from "@/lib/relay-results"

export default function IndividualSplitsModal({
  athleteName,
  title,
  timeDisplay,
  splits,
  onClose,
}: {
  athleteName?: string
  title: string
  timeDisplay?: ReactNode
  splits: ResultSplit[]
  onClose: () => void
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
            <p className="text-sm font-medium text-foreground dark:text-foreground">{athleteName}</p>
          ) : null}
          <h2
            className={`text-lg font-medium text-foreground dark:text-foreground ${
              athleteName ? "mt-0.5" : ""
            }`}
          >
            {title}
          </h2>
          {timeDisplay ? (
            <div className="mt-2 text-foreground dark:text-foreground">{timeDisplay}</div>
          ) : null}
        </div>

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
