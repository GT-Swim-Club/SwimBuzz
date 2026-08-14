"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

type HoverDetailProps = {
  label?: string
  children?: ReactNode
  className?: string
  belowClassName?: string
  aboveClassName?: string
  revealClassName?: string
  offset?: number
}

export default function HoverDetail({
  label,
  children,
  className = "",
  belowClassName = "top-full mt-1.5",
  aboveClassName = "bottom-full mb-1.5",
  revealClassName = "group-hover:visible group-hover:opacity-100 group-hover:delay-150 group-focus-visible:visible group-focus-visible:opacity-100 group-focus-visible:delay-0",
  offset = 6,
}: HoverDetailProps) {
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [placement, setPlacement] = useState<"above" | "below">("below")

  useEffect(() => {
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

      setPlacement((currentPlacement) =>
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
  }, [offset])

  return (
    <span
      ref={tooltipRef}
      role="tooltip"
      className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 invisible whitespace-nowrap rounded-lg border border-border bg-background-elevated px-2.5 py-1 text-[11px] font-medium shadow-md opacity-0 transition-opacity delay-0 duration-150 ${placement === "above" ? aboveClassName : belowClassName} ${revealClassName} ${className}`}
    >
      {children ?? label}
    </span>
  )
}
