"use client"

import { type ReactNode, useLayoutEffect, useRef, useState } from "react"

const DETAIL_FONT_MAX = 12
const DETAIL_FONT_MIN = 9
const SEPARATOR_PX = 12

export default function SummaryRowLayout({
  label,
  details,
  coachNote,
  right,
  onClick,
  className = "",
  id,
}: {
  label: ReactNode
  details?: string
  coachNote?: string
  right: ReactNode
  onClick?: () => void
  className?: string
  id?: string
}) {
  const rowRef = useRef<HTMLLIElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const detailsRef = useRef<HTMLSpanElement>(null)
  const coachRef = useRef<HTMLSpanElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const [detailFontPx, setDetailFontPx] = useState(DETAIL_FONT_MAX)
  const [truncateDetails, setTruncateDetails] = useState(false)
  const [detailsMaxWidth, setDetailsMaxWidth] = useState<number | undefined>()

  useLayoutEffect(() => {
    const row = rowRef.current
    const detailsEl = detailsRef.current
    if (!row || !details || !detailsEl) {
      setDetailFontPx(DETAIL_FONT_MAX)
      setTruncateDetails(false)
      setDetailsMaxWidth(undefined)
      return
    }

    const fit = () => {
      const rowWidth = row.clientWidth
      const rightWidth = rightRef.current?.offsetWidth ?? 0
      const labelWidth = labelRef.current?.offsetWidth ?? 0
      const coachWidth = coachRef.current?.offsetWidth ?? 0
      const rowStyles = getComputedStyle(row)
      const gap = parseFloat(rowStyles.columnGap || rowStyles.gap || "16") || 16

      let fixedWidth = rightWidth + gap + labelWidth + coachWidth + SEPARATOR_PX
      if (coachNote) fixedWidth += SEPARATOR_PX

      const available = Math.max(0, rowWidth - fixedWidth)

      for (let px = DETAIL_FONT_MAX; px >= DETAIL_FONT_MIN; px -= 0.5) {
        detailsEl.style.fontSize = `${px}px`
        if (detailsEl.scrollWidth <= available) {
          setDetailFontPx(px)
          setTruncateDetails(false)
          setDetailsMaxWidth(undefined)
          return
        }
      }

      detailsEl.style.fontSize = `${DETAIL_FONT_MIN}px`
      setDetailFontPx(DETAIL_FONT_MIN)
      if (detailsEl.scrollWidth > available) {
        setTruncateDetails(true)
        setDetailsMaxWidth(available)
      } else {
        setTruncateDetails(false)
        setDetailsMaxWidth(undefined)
      }
    }

    const ro = new ResizeObserver(fit)
    ro.observe(row)
    if (rightRef.current) ro.observe(rightRef.current)
    fit()
    return () => ro.disconnect()
  }, [label, details, coachNote])

  const rowClassName =
    "flex items-center justify-between gap-4 px-4 py-2 text-sm " +
    (onClick ? "cursor-pointer group transition-colors " : "") +
    className

  const leftClassName =
    "flex min-w-0 flex-1 items-center overflow-hidden text-left text-foreground " +
    (onClick
      ? "group-hover:text-primary transition-colors"
      : "")

  const left = (
    <>
      <span ref={labelRef} className="shrink-0 whitespace-nowrap">
        {label}
      </span>
      {details ? (
        <span
          ref={detailsRef}
          className={
            "font-sans text-foreground-tertiary " +
            (truncateDetails ? "min-w-0 truncate" : "whitespace-nowrap")
          }
          style={{
            fontSize: `${detailFontPx}px`,
            maxWidth: truncateDetails && detailsMaxWidth != null ? detailsMaxWidth : undefined,
            paddingLeft: '0.375rem'
          }}
        >
          {details}
        </span>
      ) : null}
      {coachNote ? (
        <span
          ref={coachRef}
          className="shrink-0 whitespace-nowrap text-xs text-info"
          style={{ paddingLeft: '0.25rem' }}
        >
          {coachNote}
        </span>
      ) : null}
    </>
  )

  return (
    <li
      id={id}
      ref={rowRef}
      className={rowClassName}
      onClick={onClick}
    >
      <div className={leftClassName}>{left}</div>
      <div
        ref={rightRef}
        className="flex shrink-0 items-center justify-end gap-2 text-right text-foreground"
      >
        {right}
      </div>
    </li>
  )
}
