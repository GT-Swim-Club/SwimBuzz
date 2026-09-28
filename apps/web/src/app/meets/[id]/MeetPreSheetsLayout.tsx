"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

const SPLIT_KEY = "swimbuzz-meet-pre-left-pct"
const SPLIT_DEFAULT = 50
const SPLIT_MIN = 30
const SPLIT_MAX = 70
/** Half the resize handle's width, so the two columns split the remaining space evenly. */
const HANDLE_HALF = 12

function clampPct(n: number) {
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n))
}

/**
 * Two-column meet layout used before any sheets/results exist (no roster summary):
 * the ledger cards split across a left and right column with a draggable divider.
 * The split is a percentage, persisted per browser. Stacks into one column below 900px.
 * With only one non-empty side, that side renders alone (no divider).
 */
export default function MeetPreSheetsLayout({
  left,
  right,
}: {
  left: ReactNode[]
  right: ReactNode[]
}) {
  const [pct, setPct] = useState(SPLIT_DEFAULT)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let saved = NaN
    try {
      saved = parseFloat(window.localStorage.getItem(SPLIT_KEY) ?? "")
    } catch {}
    if (Number.isFinite(saved)) {
      const frame = requestAnimationFrame(() => setPct(clampPct(saved)))
      return () => cancelAnimationFrame(frame)
    }
  }, [])

  function save(value: number) {
    try {
      window.localStorage.setItem(SPLIT_KEY, String(value))
    } catch {}
  }

  function startResize(e: React.PointerEvent) {
    const grid = gridRef.current
    if (!grid) return
    e.preventDefault()
    const rect = grid.getBoundingClientRect()
    let latest = pct
    const onMove = (ev: PointerEvent) => {
      latest = clampPct(((ev.clientX - rect.left - HANDLE_HALF) / rect.width) * 100)
      setPct(latest)
    }
    const onUp = () => {
      save(latest)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  function nudge(e: React.KeyboardEvent) {
    const step = e.key === "ArrowLeft" ? -2 : e.key === "ArrowRight" ? 2 : 0
    if (!step) return
    e.preventDefault()
    const next = clampPct(pct + step)
    setPct(next)
    save(next)
  }

  const single = left.length === 0 || right.length === 0

  if (single) {
    return (
      <div className="flex items-start">
        <div className="flex w-full min-w-0 flex-col gap-4 min-[901px]:w-[calc(50%-12px)]">
          {left.length > 0 ? left : right}
        </div>
      </div>
    )
  }

  return (
    <div ref={gridRef} className="flex items-start max-[900px]:flex-col max-[900px]:gap-4">
      <div
        className="flex min-w-0 flex-col gap-4 max-[900px]:!w-full max-[900px]:!flex-none"
        style={{ flex: `0 0 calc(${pct}% - ${HANDLE_HALF}px)` }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize columns"
        aria-valuemin={SPLIT_MIN}
        aria-valuemax={SPLIT_MAX}
        aria-valuenow={Math.round(pct)}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={nudge}
        className="flex w-6 shrink-0 cursor-col-resize touch-none items-stretch justify-center self-stretch transition-colors hover:bg-fill-secondary max-[900px]:hidden"
      >
        <span className="w-px bg-border" />
      </div>
      <div className="flex min-w-0 flex-[1_1_0] flex-col gap-4 max-[900px]:w-full">{right}</div>
    </div>
  )
}
