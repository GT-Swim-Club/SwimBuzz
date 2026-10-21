"use client"

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

/**
 * A grid whose rows are as even as possible: it uses the fewest rows that fit `minColumnPx`
 * columns, then spreads the items evenly across them (8 items where 6 fit → 4 + 4, not 6 + 2).
 * Columns stretch to fill the full width.
 */
export default function BalancedGrid({
  count,
  minColumnPx,
  gapXPx,
  className = "",
  children,
}: {
  /** Number of grid items. */
  count: number
  minColumnPx: number
  /** Horizontal gap between columns — must match the column gap in `className`. */
  gapXPx: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const fit = Math.max(1, Math.floor((el.clientWidth + gapXPx) / (minColumnPx + gapXPx)))
      const rows = Math.ceil(Math.max(count, 1) / fit)
      setColumns(Math.max(1, Math.ceil(count / rows)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [count, minColumnPx, gapXPx])

  const style: CSSProperties = {
    // Before the first measurement (server render), fall back to as many columns as fit.
    gridTemplateColumns: columns
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(auto-fill, minmax(${minColumnPx}px, 1fr))`,
  }
  return (
    <div ref={ref} className={`grid ${className}`} style={style}>
      {children}
    </div>
  )
}
