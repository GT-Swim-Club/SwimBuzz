"use client"

import { useLayoutEffect, useRef, type ReactNode } from "react"

/**
 * An h1 that shrinks its font to keep the text on one line, never below `minPx`;
 * past that it wraps. The largest size comes from `className` (responsive text-* classes work).
 */
export default function FitHeading({
  children,
  className = "",
  minPx = 24,
}: {
  children: ReactNode
  className?: string
  minPx?: number
}) {
  const ref = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return

    const fit = () => {
      // Measure one line at the class's own size, then scale down to the available width.
      el.style.fontSize = ""
      el.style.whiteSpace = "nowrap"
      const maxPx = parseFloat(getComputedStyle(el).fontSize)
      if (el.scrollWidth <= el.clientWidth) return
      // Text width doesn't scale exactly with font size, so one scaled guess can still overflow by
      // a hair — and wrap at nearly full size, flipping between one and two lines while the window
      // resizes. Keep shrinking (a little more each pass) until it fits or reaches `minPx`.
      let size = maxPx
      for (let pass = 0; pass < 8 && size > minPx && el.scrollWidth > el.clientWidth; pass++) {
        const scaled = Math.floor(size * (el.clientWidth / el.scrollWidth) * 10) / 10
        size = Math.max(minPx, Math.min(scaled, size - 0.2))
        el.style.fontSize = `${size}px`
      }
      if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = "normal"
    }

    fit()
    // Refit when the room changes: the parent resizing, or a sibling (like staff-only edit buttons
    // appearing after a role switch) narrowing the heading inside it. Only widths count — the
    // heading's own height changes as it refits.
    let lastWidths = `${box.clientWidth}:${el.clientWidth}`
    const observer = new ResizeObserver(() => {
      const widths = `${box.clientWidth}:${el.clientWidth}`
      if (widths === lastWidths) return
      lastWidths = widths
      fit()
    })
    observer.observe(box)
    observer.observe(el)
    // Web fonts swapping in change the text's width.
    void document.fonts?.ready.then(fit)
    return () => observer.disconnect()
  }, [children, minPx])

  return (
    <h1 ref={ref} className={className}>
      {children}
    </h1>
  )
}
