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
        className="relative z-10 flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-2">
          {athleteName ? (
            <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{athleteName}</p>
          ) : null}
          <h2
            className={`text-lg font-medium text-gray-900 dark:text-zinc-100 ${
              athleteName ? "mt-0.5" : ""
            }`}
          >
            {title}
          </h2>
          {timeDisplay ? (
            <div className="mt-2 text-gray-900 dark:text-zinc-100">{timeDisplay}</div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ul className="divide-y dark:divide-zinc-800 border rounded-lg dark:border-zinc-800 overflow-hidden">
            <li className="grid grid-cols-[4.5rem_1fr] gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500 bg-gray-50 dark:bg-zinc-950/50">
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
                  <span className="text-gray-800 dark:text-zinc-200">{split.distance}</span>
                  <span className="font-mono text-right text-gray-900 dark:text-zinc-100">
                    {time ? formatDisplayTime(time) : ""}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="shrink-0 border-t border-gray-200 px-6 py-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
