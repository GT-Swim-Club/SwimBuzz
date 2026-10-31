"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"

const MAX_PX = 20
/** As small as the value shrinks to stay on one line before it wraps onto two instead. */
const MIN_PX = 14

/**
 * A stat tile's text value (a name, an event) on one line at up to 20px, shrinking to fit the
 * tile's width down to 14px, then wrapping onto balanced lines rather than running out of the tile.
 * Measured, since it depends on the text and the tile's width.
 */
export default function LedgerFitValue({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.whiteSpace = "nowrap"
      let size = MAX_PX
      el.style.fontSize = `${size}px`
      const room = el.clientWidth
      if (room <= 0) return
      // Start from the proportional size, then step down until it truly fits (text doesn't scale
      // exactly linearly, and widths round).
      if (el.scrollWidth > room) {
        size = Math.max(MIN_PX, Math.floor((MAX_PX * room) / el.scrollWidth))
        el.style.fontSize = `${size}px`
      }
      while (el.scrollWidth > room && size > MIN_PX) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
      if (el.scrollWidth > room) el.style.whiteSpace = "normal"
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [children])
  return (
    <span ref={ref} className="block w-full min-w-0 [overflow-wrap:break-word] [text-wrap:balance]">
      {children}
    </span>
  )
}
