"use client"

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

/**
 * A grid whose rows are as even as possible: it uses the fewest rows that fit `minColumnPx`
 * columns, then spreads the items evenly across them (8 items where 6 fit → 4 + 4, not 6 + 2).
 * Columns stretch to fill the full width.
 *
 * With `alignedColumns`, items are instead laid out in that many fixed columns (children include
 * `data-placeholder` blanks to keep positions) whenever they fit; otherwise it falls back to the
 * balanced layout above, hiding the placeholders. Children can react to the mode through the
 * `group/rows` data attribute `data-aligned`.
 */
export default function BalancedGrid({
  count,
  minColumnPx,
  gapXPx,
  alignedColumns,
  className = "",
  children,
}: {
  /** Number of grid items. */
  count: number
  minColumnPx: number
  /** Horizontal gap between columns — must match the column gap in `className`. */
  gapXPx: number
  /** Fixed column count to use while that many `minColumnPx` columns fit. */
  alignedColumns?: number
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState<number | null>(null)
  const [aligned, setAligned] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const fit = Math.max(1, Math.floor((el.clientWidth + gapXPx) / (minColumnPx + gapXPx)))
      if (alignedColumns != null && fit >= alignedColumns) {
        setAligned(true)
        setColumns(alignedColumns)
        return
      }
      const rows = Math.ceil(Math.max(count, 1) / fit)
      setAligned(false)
      setColumns(Math.max(1, Math.ceil(count / rows)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [count, minColumnPx, gapXPx, alignedColumns])

  const style: CSSProperties = {
    // Before the first measurement (server render), fall back to as many columns as fit.
    gridTemplateColumns: columns
      ? `repeat(${columns}, minmax(0, 1fr))`
      : `repeat(auto-fill, minmax(${minColumnPx}px, 1fr))`,
  }
  return (
    <div ref={ref} data-aligned={aligned} className={`group/rows grid ${className}`} style={style}>
      {children}
    </div>
  )
}
