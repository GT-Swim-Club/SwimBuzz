"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

const LEDGER_KEY = "swimbuzz-meet-ledger-width-v2"
const LEDGER_DEFAULT = 420
const LEDGER_MIN = 280
const LEDGER_MAX = 640
const PIN_TOP = 16
const PIN_BOTTOM = 24

function clampWidth(n: number) {
  return Math.min(LEDGER_MAX, Math.max(LEDGER_MIN, n))
}

/**
 * Two-column meet layout: a resizable ledger sidebar beside the main content.
 *
 * The ledger is natively sticky, so it scrolls with the page until you've seen all of it
 * and then simply stays put: a short one sticks under the top edge, a tall one sticks with
 * its bottom edge at the bottom of the screen (a negative `top`). Only that `top` value is
 * computed in JS, and only when sizes change — never per scroll frame.
 */
export default function MeetLedgerLayout({
  ledger,
  children,
}: {
  ledger: ReactNode
  children: ReactNode
}) {
  const [width, setWidth] = useState(LEDGER_DEFAULT)
  const ledgerRef = useRef<HTMLElement>(null)
  const [stickyTop, setStickyTop] = useState(PIN_TOP)

  useEffect(() => {
    let saved = NaN
    try {
      saved = parseInt(window.localStorage.getItem(LEDGER_KEY) ?? "", 10)
    } catch {}
    if (Number.isFinite(saved)) {
      const frame = requestAnimationFrame(() => setWidth(clampWidth(saved)))
      return () => cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const el = ledgerRef.current
    const scrollEl = document.getElementById("page-scroll")
    if (!el || !scrollEl) return
    const measure = () => {
      const h = el.offsetHeight
      const vh = scrollEl.clientHeight
      setStickyTop(h + PIN_BOTTOM <= vh - PIN_TOP ? PIN_TOP : vh - PIN_BOTTOM - h)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(scrollEl)
    measure()
    return () => ro.disconnect()
  }, [])

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    let latest = startWidth
    const onMove = (ev: PointerEvent) => {
      latest = clampWidth(startWidth + (ev.clientX - startX))
      setWidth(latest)
    }
    const onUp = () => {
      try {
        window.localStorage.setItem(LEDGER_KEY, String(latest))
      } catch {}
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  function nudge(e: React.KeyboardEvent) {
    const step = e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0
    if (!step) return
    e.preventDefault()
    const next = clampWidth(width + step)
    setWidth(next)
    try {
      window.localStorage.setItem(LEDGER_KEY, String(next))
    } catch {}
  }

  return (
    <div className="flex flex-wrap items-start">
      <aside
        ref={ledgerRef}
        className="meet-ledger sticky flex max-w-full flex-col gap-4 self-start max-[900px]:static max-[900px]:!w-full max-[900px]:!flex-[1_1_100%]"
        style={{ flex: `0 0 ${width}px`, width, top: stickyTop }}
      >
        {ledger}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={LEDGER_MIN}
        aria-valuemax={LEDGER_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={nudge}
        className="flex w-6 shrink-0 cursor-col-resize touch-none items-stretch justify-center self-stretch transition-colors hover:bg-fill-secondary max-[900px]:hidden"
      >
        <span className="w-px bg-border" />
      </div>
      <div
        className="flex min-w-0 flex-[1_1_480px] flex-col gap-8 pl-2 max-[900px]:mt-8 max-[900px]:pl-0"
      >
        {children}
      </div>
    </div>
  )
}
