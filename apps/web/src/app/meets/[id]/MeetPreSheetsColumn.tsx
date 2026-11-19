"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"

/** Space left under the column at the bottom of the window. */
const BOTTOM_GAP = 32
/** Never scale past this, however short the column is. */
const MAX_ZOOM = 1.25
/** Phones and narrow windows keep the normal size. */
const MIN_WIDTH = 901

/**
 * The meet page's cards before the roster summary exists, stacked in one column. With only a few
 * cards there's a lot of empty window below them, so the whole column (text, rows, icons and
 * spacing alike) is scaled up with CSS `zoom` until it reaches the bottom of the window — never
 * past it, and never smaller than normal.
 */
export default function MeetPreSheetsColumn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      if (window.innerWidth < MIN_WIDTH) {
        el.style.zoom = ""
        return
      }
      // Measure at normal size, then scale; both happen before the browser paints.
      el.style.zoom = "1"
      const rect = el.getBoundingClientRect()
      const top = rect.top + window.scrollY
      const available = window.innerHeight - top - BOTTOM_GAP
      const zoom = rect.height > 0 ? Math.min(MAX_ZOOM, Math.max(1, available / rect.height)) : 1
      el.style.zoom = String(zoom)
    }

    fit()
    // Cards opening or loading content change the column's height; the final size after `fit` is
    // the one already reported, so this doesn't loop.
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    window.addEventListener("resize", fit)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [])

  return (
    <div ref={ref} className="flex flex-col gap-4">
      {children}
    </div>
  )
}
