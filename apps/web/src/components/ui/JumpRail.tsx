"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

/** One rail entry: a letter ("B") or an event number ("12"), and the element it scrolls to. */
export type JumpRailItem = {
  key: string
  label: string
  /** Spoken name when the label alone is too terse, e.g. "Event 12, Women 200 Free". */
  ariaLabel?: string
  /** Shown beside the entry while it's hovered or dragged over, e.g. the event name "Women 200 Free". */
  hoverLabel?: string
  /** The `id` to scroll to, or none when nothing is listed under this entry. */
  targetId?: string
}

export const JUMP_RAIL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

/** Full-size entry height (11px text on a 16px line plus 1px above and below), as on the roster. */
const ITEM_MAX_PX = 18
/** Smallest entry height when shrinking to fit; past this the rail runs off the bottom. */
const ITEM_MIN_PX = 11
/** The sticky offset (top-2) plus the same gap left below the rail. */
const WINDOW_GAP_PX = 16
/** The nav's vertical padding (py-1). */
const NAV_PADDING_PX = 8
/** Wait before the hover label first shows — the same as HoverDetail's. A drag shows it at once. */
const HOVER_DELAY_MS = 500

/**
 * Sticky jump list down the side of a list. Every entry is clickable; one with nothing listed
 * under it jumps to the next that has something (or the last one, past the end). Pressing and
 * dragging along the rail scrubs through the entries, jumping as the pointer crosses each one
 * (like the iOS contacts index). When the entries don't fit the window, they shrink to fit.
 *
 * Wrap the list and the rail in `JUMP_RAIL_LAYOUT_CLASS` with the list in a `min-w-0 flex-1` box:
 * the rail then sits beside the list, or out in the page's right margin once that's wide enough
 * to hold it. Targets are scrolled to their `scroll-margin-top` below the top of the page area.
 */
export default function JumpRail({ label, items }: { label: string; items: JumpRailItem[] }) {
  const navRef = useRef<HTMLElement>(null)
  // Entry under the pointer while pressing/dragging (highlighted), or null.
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)
  const scrubIndexRef = useRef<number | null>(null)
  // Entry under a mouse that's hovering the rail without pressing, or null.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  // Whether the hover label is up: it waits HOVER_DELAY_MS after the mouse reaches the rail, then
  // follows the mouse from entry to entry with no further wait until it leaves.
  const [hoverShown, setHoverShown] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [itemPx, setItemPx] = useState(ITEM_MAX_PX)

  useEffect(() => () => clearTimeout(hoverTimerRef.current ?? undefined), [])

  const count = items.length
  useLayoutEffect(() => {
    const scroller = document.getElementById("page-scroll")
    const fit = () => {
      const height = scroller?.clientHeight ?? window.innerHeight
      const fits = (height - WINDOW_GAP_PX - NAV_PADDING_PX) / Math.max(1, count)
      setItemPx(Math.max(ITEM_MIN_PX, Math.min(ITEM_MAX_PX, Math.floor(fits))))
    }
    fit()
    const observer = scroller ? new ResizeObserver(fit) : null
    if (scroller) observer?.observe(scroller)
    window.addEventListener("resize", fit)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", fit)
    }
  }, [count])

  if (!items.some((item) => item.targetId)) return null

  const jumpTo = (index: number, behavior: ScrollBehavior = "smooth") => {
    const target =
      items.slice(index).find((item) => item.targetId) ?? items.slice(0, index).findLast((item) => item.targetId)
    const el = target?.targetId ? document.getElementById(target.targetId) : null
    const scroller = document.getElementById("page-scroll")
    if (!el || !scroller) return
    // Scroll only the page area: scrollIntoView would also scroll the body/html
    // when a late entry can't reach the top, pushing the nav off screen.
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - margin
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    scroller.scrollTo({ top, behavior: reduceMotion ? "auto" : behavior })
  }

  /** The entry at a pointer's height, clamped to the first/last above or below the rail. */
  const indexAt = (clientY: number) => {
    const buttons = navRef.current?.querySelectorAll<HTMLElement>("button")
    if (!buttons?.length) return null
    for (let i = 0; i < buttons.length; i++) {
      if (clientY < buttons[i].getBoundingClientRect().bottom) return i
    }
    return buttons.length - 1
  }

  const scrubTo = (clientY: number, behavior: ScrollBehavior) => {
    const index = indexAt(clientY)
    if (index == null || index === scrubIndexRef.current) return
    scrubIndexRef.current = index
    setScrubIndex(index)
    jumpTo(index, behavior)
  }

  const endScrub = () => {
    scrubIndexRef.current = null
    setScrubIndex(null)
  }

  // 11px text at full size, down to 9px as the entries shrink.
  const fontPx = Math.max(9, Math.min(11, itemPx - 7))

  const hoverAt = (index: number | null) => {
    setHoverIndex(index)
    if (index == null) {
      clearTimeout(hoverTimerRef.current ?? undefined)
      hoverTimerRef.current = null
      setHoverShown(false)
    } else if (!hoverShown && !hoverTimerRef.current) {
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null
        setHoverShown(true)
      }, HOVER_DELAY_MS)
    }
  }

  // The hover label follows the entry being dragged over (at once), else the one a mouse is
  // hovering (once the hover delay has passed).
  const activeIndex = scrubIndex ?? (hoverShown ? hoverIndex : null)
  const activeLabel = activeIndex != null ? items[activeIndex]?.hoverLabel : undefined

  return (
    // The slot stretches to the list's height so the nav inside can stick while scrolling. From
    // 1040px wide the page gutter (--page-gutter-x) is 38px+, room for the rail and its 12px gap,
    // so it moves out into the right margin, just beside the list, instead of narrowing it.
    <div className="shrink-0 self-stretch min-[1040px]:absolute min-[1040px]:inset-y-0 min-[1040px]:left-full min-[1040px]:ml-3">
      <nav
        ref={navRef}
        aria-label={label}
        // touch-none so a finger drag scrubs the entries instead of scrolling the page.
        className="sticky top-2 flex touch-none select-none flex-col items-center py-1"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          // Keep receiving moves when the pointer drifts off the rail mid-drag.
          e.currentTarget.setPointerCapture(e.pointerId)
          scrubTo(e.clientY, "smooth")
        }}
        onPointerMove={(e) => {
          // Jump instantly while dragging so the list keeps up with the pointer.
          if (scrubIndexRef.current != null) scrubTo(e.clientY, "auto")
          else if (e.pointerType === "mouse") hoverAt(indexAt(e.clientY))
        }}
        onPointerLeave={() => hoverAt(null)}
        onPointerUp={(e) => {
          endScrub()
          // Back to hovering the entry the drag let go on, if it let go on the rail — the label
          // was already up for the drag, so it stays without waiting again.
          const rect = e.currentTarget.getBoundingClientRect()
          const onRail =
            e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
          const index = e.pointerType === "mouse" && onRail ? indexAt(e.clientY) : null
          hoverAt(index)
          if (index != null) setHoverShown(true)
        }}
        onPointerCancel={endScrub}
        onLostPointerCapture={endScrub}
      >
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            aria-label={item.ariaLabel}
            // Pointer presses are handled by the rail's scrub above; this covers the keyboard.
            onClick={(e) => {
              if (e.detail === 0) jumpTo(index)
            }}
            style={{ height: itemPx, fontSize: fontPx, lineHeight: `${itemPx}px` }}
            className={`w-4 cursor-pointer rounded text-center font-semibold tabular-nums transition-colors hover:text-primary min-[1040px]:w-5 ${
              scrubIndex === index ? "text-primary" : "text-foreground-secondary"
            }`}
          >
            {item.label}
          </button>
        ))}
        {activeLabel && activeIndex != null ? (
          // Out to the left of the entry, centered on it, so it doesn't cover the entries below;
          // shown at once (no hover delay) so names keep up as the pointer runs down the rail.
          // Same look as HoverDetail. The `nav` is sticky, so this positions against it.
          <span
            aria-hidden
            style={{ top: 4 + activeIndex * itemPx + itemPx / 2 }}
            className="pointer-events-none absolute right-full z-30 mr-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-background-elevated px-2.5 py-1 text-[11px] font-medium text-foreground shadow-md"
          >
            {activeLabel}
          </span>
        ) : null}
      </nav>
    </div>
  )
}

/** The box around a list and its JumpRail (see JumpRail). */
export const JUMP_RAIL_LAYOUT_CLASS = "relative flex items-start gap-1 min-[1040px]:block"
