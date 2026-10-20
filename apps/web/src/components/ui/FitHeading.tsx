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
      const ratio = el.clientWidth / el.scrollWidth
      if (ratio >= 1) return
      el.style.fontSize = `${Math.max(minPx, Math.floor(maxPx * ratio * 10) / 10)}px`
      if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = "normal"
    }

    fit()
    // Watch the parent: the heading's own height changes as it refits.
    const observer = new ResizeObserver(fit)
    observer.observe(box)
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
