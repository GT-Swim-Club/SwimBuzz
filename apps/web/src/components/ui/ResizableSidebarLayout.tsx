"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

const PIN_TOP = 16
const PIN_BOTTOM = 24

/**
 * Two-column layout: a resizable sidebar beside the main content. Stacks below 900px.
 *
 * The sidebar is natively sticky, so it scrolls with the page until you've seen all of it
 * and then simply stays put: a short one sticks under the top edge, a tall one sticks with
 * its bottom edge at the bottom of the screen (a negative `top`). Only that `top` value is
 * computed in JS, and only when sizes change — never per scroll frame.
 */
export default function ResizableSidebarLayout({
  sidebar,
  children,
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  sidebarClassName = "gap-4",
  mainClassName = "gap-8",
}: {
  sidebar: ReactNode
  children: ReactNode
  /** localStorage key the dragged width is remembered under. */
  storageKey: string
  defaultWidth: number
  minWidth: number
  maxWidth: number
  sidebarClassName?: string
  mainClassName?: string
}) {
  const [width, setWidth] = useState(defaultWidth)
  const [dragging, setDragging] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const [stickyTop, setStickyTop] = useState(PIN_TOP)

  const clampWidth = (n: number) => Math.min(maxWidth, Math.max(minWidth, n))

  useEffect(() => {
    let saved = NaN
    try {
      saved = parseInt(window.localStorage.getItem(storageKey) ?? "", 10)
    } catch {}
    if (Number.isFinite(saved)) {
      const frame = requestAnimationFrame(() =>
        setWidth(Math.min(maxWidth, Math.max(minWidth, saved)))
      )
      return () => cancelAnimationFrame(frame)
    }
  }, [storageKey, minWidth, maxWidth])

  useEffect(() => {
    const el = sidebarRef.current
    const scrollEl = document.getElementById("page-scroll")
    if (!el || !scrollEl) return
    const measure = () => {
      const h = el.offsetHeight
      const vh = scrollEl.clientHeight
      setStickyTop(h + PIN_BOTTOM <= vh - PIN_TOP ? PIN_TOP : vh - PIN_BOTTOM - h)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    ro.observe(scrollEl)
    measure()
    return () => ro.disconnect()
  }, [])

  function save(next: number) {
    try {
      window.localStorage.setItem(storageKey, String(next))
    } catch {}
  }

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    let latest = startWidth
    setDragging(true)
    // Keep the resize cursor even when the pointer leaves the handle mid-drag.
    document.body.style.cursor = "col-resize"
    const onMove = (ev: PointerEvent) => {
      latest = clampWidth(startWidth + (ev.clientX - startX))
      setWidth(latest)
    }
    const onUp = () => {
      save(latest)
      setDragging(false)
      document.body.style.cursor = ""
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  function nudge(e: React.KeyboardEvent) {
    const step = e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0
    if (!step) return
    e.preventDefault()
    const next = clampWidth(width + step)
    setWidth(next)
    save(next)
  }

  return (
    <div className="flex flex-wrap items-start">
      <aside
        ref={sidebarRef}
        className={`sticky flex max-w-full flex-col self-start max-[900px]:static max-[900px]:!w-full max-[900px]:!flex-[1_1_100%] ${sidebarClassName}`}
        style={{ flex: `0 0 ${width}px`, width, top: stickyTop }}
      >
        {sidebar}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={nudge}
        className="group flex w-6 shrink-0 cursor-col-resize touch-none items-stretch justify-center self-stretch max-[900px]:hidden"
      >
        <span
          className={`w-px transition-colors group-hover:bg-primary group-hover:delay-100 ${dragging ? "bg-primary" : "bg-border"}`}
        />
      </div>
      <div
        className={`flex min-w-0 flex-[1_1_480px] flex-col pl-2 max-[900px]:mt-8 max-[900px]:pl-0 ${mainClassName}`}
      >
        {children}
      </div>
    </div>
  )
}
