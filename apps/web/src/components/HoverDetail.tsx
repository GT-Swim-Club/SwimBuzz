"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

type HoverDetailProps = {
  /** A single line of text, or multiple lines (e.g. one per time zone) stacked vertically. */
  label?: string | string[]
  children?: ReactNode
  className?: string
  textClassName?: string
  belowClassName?: string
  aboveClassName?: string
  revealClassName?: string
  offset?: number
  /** Pin the tooltip to one side instead of auto-picking based on viewport space — e.g. "above" for a trigger that sits directly over content the tooltip would otherwise cover. */
  placement?: "auto" | "above" | "below"
}

export default function HoverDetail({
  label,
  children,
  className = "",
  textClassName = "text-foreground",
  belowClassName = "top-full mt-1.5",
  aboveClassName = "bottom-full mb-1.5",
  revealClassName = "group-hover:visible group-hover:opacity-100 group-hover:delay-150 group-focus-visible:visible group-focus-visible:opacity-100 group-focus-visible:delay-0",
  offset = 6,
  placement: placementProp = "auto",
}: HoverDetailProps) {
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [autoPlacement, setAutoPlacement] = useState<"above" | "below">("below")
  const placement = placementProp === "auto" ? autoPlacement : placementProp

  useEffect(() => {
    if (placementProp !== "auto") return
    const trigger = tooltipRef.current?.parentElement
    if (!trigger) return

    function updatePlacement() {
      const tooltip = tooltipRef.current
      if (!tooltip || !trigger) return

      const availableBelow = window.innerHeight - trigger.getBoundingClientRect().bottom
      const nextPlacement =
        availableBelow < tooltip.getBoundingClientRect().height + offset
          ? "above"
          : "below"

      setAutoPlacement((currentPlacement) =>
        currentPlacement === nextPlacement ? currentPlacement : nextPlacement,
      )
    }

    trigger.addEventListener("pointerenter", updatePlacement)
    trigger.addEventListener("focusin", updatePlacement)
    window.addEventListener("resize", updatePlacement)
    window.addEventListener("scroll", updatePlacement, true)

    return () => {
      trigger.removeEventListener("pointerenter", updatePlacement)
      trigger.removeEventListener("focusin", updatePlacement)
      window.removeEventListener("resize", updatePlacement)
      window.removeEventListener("scroll", updatePlacement, true)
    }
  }, [offset, placementProp])

  const lines = Array.isArray(label) ? label : null

  return (
    <span
      ref={tooltipRef}
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-30 w-max -translate-x-1/2 invisible whitespace-pre-line text-left rounded-lg border border-border bg-background-elevated px-2.5 py-1 text-[11px] font-medium ${textClassName} shadow-md opacity-0 transition-opacity delay-0 duration-150 ${placement === "above" ? aboveClassName : belowClassName} ${revealClassName} ${className}`}
    >
      {children ?? (lines ? lines.join("\n") : label)}
    </span>
  )
}
