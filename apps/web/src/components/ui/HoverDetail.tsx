"use client"

import { createPortal } from "react-dom"
import { useEffect, useRef, useState, type ReactNode } from "react"

type HoverDetailProps = {
  /** A single line of text, or multiple lines (e.g. one per time zone) stacked vertically. */
  label?: string | string[]
  children?: ReactNode
  className?: string
  textClassName?: string
  offset?: number
  /** Pin the tooltip to one side instead of auto-picking based on viewport space — e.g. "above" for a trigger that sits directly over content the tooltip would otherwise cover. "right" sits beside the trigger, vertically centered on it. */
  placement?: "auto" | "above" | "below" | "right"
  /** Only reveal on pointer hover at desktop widths (md+) — for triggers whose tap target overlaps a synthetic mobile "hover" that would otherwise pop the detail open on touch. Keyboard focus still reveals it everywhere. */
  desktopOnly?: boolean
  /** Anchor to the pointer instead of the trigger's box — for tall/wide triggers (e.g. a full-height divider) whose edges may be off-screen. */
  followPointer?: boolean
}

// Deliberate hover delay so the tooltip doesn't flash in as the pointer passes over the
// trigger — but once one tooltip has just closed, the next one within REGROUP_WINDOW_MS
// opens instantly, matching how OS/native tooltip groups behave when scanning nearby controls.
const SHOW_DELAY_MS = 500
const REGROUP_WINDOW_MS = 300
const DESKTOP_QUERY = "(min-width: 768px)"
// Minimum gap kept between the tooltip and the viewport edge when nudging it back into view.
const VIEWPORT_PADDING = 8
// Where the tooltip renders while its size/position haven't been measured yet — off-screen so
// it never flashes at the wrong spot, but still laid out so getBoundingClientRect() works.
const UNMEASURED_POSITION = { top: -9999, left: -9999, placement: "below" as const }

let lastHiddenAt = 0

type Position = { top: number; left: number; placement: "above" | "below" | "right" }

export default function HoverDetail({
  label,
  children,
  className = "",
  textClassName = "text-foreground",
  offset = 6,
  placement: placementProp = "auto",
  desktopOnly = false,
  followPointer = false,
}: HoverDetailProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<Position>(UNMEASURED_POSITION)

  // The portal only exists client-side (document.body isn't available during SSR) — wait for
  // mount so the server- and first-client-render markup match, avoiding a hydration mismatch.
  useEffect(() => setMounted(true), [])

  // Rendered in a portal (see below) so an ancestor with `overflow-hidden` — e.g. the
  // collapsible practices sidebar — can never clip it; position is computed from
  // viewport-relative rects, which line up with `position: fixed` with no scroll math needed.
  useEffect(() => {
    const trigger = anchorRef.current?.parentElement
    if (!trigger) return

    let showTimeout: ReturnType<typeof setTimeout> | null = null
    let isShown = false
    // Set by a mouse click on the trigger and cleared when the pointer leaves, so clicking a
    // button doesn't pop its tooltip (via the hover timer or the focus the click causes) while the
    // cursor stays put — matching native tooltips. Touch is exempt: a tap is how touch users
    // reveal the detail at all.
    let suppressedByClick = false
    let pointer: { x: number; y: number } | null = null

    function clearShowTimeout() {
      if (showTimeout) {
        clearTimeout(showTimeout)
        showTimeout = null
      }
    }

    function computePosition(): Position | null {
      const tooltip = tooltipRef.current
      if (!tooltip || !trigger) return null

      const triggerRect =
        followPointer && pointer ? new DOMRect(pointer.x, pointer.y, 0, 0) : trigger.getBoundingClientRect()
      const tooltipRect = tooltip.getBoundingClientRect()

      if (placementProp === "right") {
        const centeredTop = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        const maxTop = Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - tooltipRect.height)
        return {
          top: Math.min(Math.max(centeredTop, VIEWPORT_PADDING), maxTop),
          left: triggerRect.right + offset,
          placement: "right",
        }
      }

      const roomBelow = window.innerHeight - triggerRect.bottom
      const nextPlacement: "above" | "below" =
        placementProp === "auto"
          ? roomBelow < tooltipRect.height + offset
            ? "above"
            : "below"
          : placementProp

      const top =
        nextPlacement === "below"
          ? triggerRect.bottom + offset
          : triggerRect.top - offset - tooltipRect.height

      const naturalLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      const maxLeft = Math.max(VIEWPORT_PADDING, window.innerWidth - VIEWPORT_PADDING - tooltipRect.width)
      const left = Math.min(Math.max(naturalLeft, VIEWPORT_PADDING), maxLeft)

      return { top, left, placement: nextPlacement }
    }

    function updatePosition() {
      const next = computePosition()
      if (!next) return
      setPosition((current) =>
        current.top === next.top && current.left === next.left && current.placement === next.placement
          ? current
          : next,
      )
    }

    function show(immediate: boolean) {
      if (suppressedByClick) return
      if (desktopOnly && !window.matchMedia(DESKTOP_QUERY).matches) return
      clearShowTimeout()
      updatePosition()
      const delay = immediate || Date.now() - lastHiddenAt < REGROUP_WINDOW_MS ? 0 : SHOW_DELAY_MS
      if (delay === 0) {
        isShown = true
        setVisible(true)
      } else {
        showTimeout = setTimeout(() => {
          // The pointer may have moved during the delay.
          if (followPointer) updatePosition()
          isShown = true
          setVisible(true)
        }, delay)
      }
    }

    function hide() {
      clearShowTimeout()
      if (isShown) lastHiddenAt = Date.now()
      isShown = false
      setVisible(false)
    }

    function trackPointer(event: PointerEvent) {
      if (!followPointer) return
      pointer = { x: event.clientX, y: event.clientY }
      if (isShown) updatePosition()
    }

    function handlePointerEnter(event: PointerEvent) {
      trackPointer(event)
      show(false)
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType !== "mouse") return
      suppressedByClick = true
      hide()
    }

    function handlePointerLeave() {
      suppressedByClick = false
      hide()
    }

    function handleFocusIn() {
      show(true)
    }

    function handleViewportChange() {
      if (isShown) updatePosition()
    }

    trigger.addEventListener("pointerenter", handlePointerEnter)
    trigger.addEventListener("pointerdown", handlePointerDown)
    trigger.addEventListener("pointermove", trackPointer)
    trigger.addEventListener("pointerleave", handlePointerLeave)
    trigger.addEventListener("focusin", handleFocusIn)
    trigger.addEventListener("focusout", hide)
    window.addEventListener("resize", handleViewportChange)
    window.addEventListener("scroll", handleViewportChange, true)

    return () => {
      clearShowTimeout()
      trigger.removeEventListener("pointerenter", handlePointerEnter)
      trigger.removeEventListener("pointerdown", handlePointerDown)
      trigger.removeEventListener("pointermove", trackPointer)
      trigger.removeEventListener("pointerleave", handlePointerLeave)
      trigger.removeEventListener("focusin", handleFocusIn)
      trigger.removeEventListener("focusout", hide)
      window.removeEventListener("resize", handleViewportChange)
      window.removeEventListener("scroll", handleViewportChange, true)
    }
  }, [desktopOnly, followPointer, offset, placementProp])

  const lines = Array.isArray(label) ? label : null

  const tooltip = (
    <span
      ref={tooltipRef}
      role="tooltip"
      style={{ position: "fixed", top: position.top, left: position.left }}
      className={`pointer-events-none z-50 w-max whitespace-pre-line text-left rounded-lg border border-border bg-background-elevated px-2.5 py-1 text-[11px] font-medium ${textClassName} shadow-md transition-opacity duration-150 ${
        visible ? "visible opacity-100" : "invisible opacity-0"
      } ${className}`}
    >
      {children ?? (lines ? lines.join("\n") : label)}
    </span>
  )

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden="true" />
      {mounted ? createPortal(tooltip, document.body) : null}
    </>
  )
}
