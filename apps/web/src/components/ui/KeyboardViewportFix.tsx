"use client"

import { useEffect } from "react"

const FIELD_SELECTOR = "input, textarea, select, [contenteditable='true'], [contenteditable='']"

/**
 * iOS Safari overlays the on-screen keyboard instead of resizing the page, and the app's
 * scroll container is a fixed-height `body`, so the focused field can end up hidden behind
 * the keyboard on first focus. Track the visual viewport height in `--app-height` (consumed
 * by the root layout) so the scroll area shrinks to the visible region, then scroll the
 * focused field into view.
 */
export default function KeyboardViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const root = document.documentElement
    let frame = 0

    const sync = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--app-height", `${vv.height}px`)
        // iOS may pan the layout viewport when the keyboard opens; keep the app pinned to the top.
        if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0)

        const active = document.activeElement
        if (active instanceof HTMLElement && active.matches(FIELD_SELECTOR)) {
          active.scrollIntoView({ block: "center", behavior: "auto" })
        }
      })
    }

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.matches(FIELD_SELECTOR)) return
      // The keyboard animates in after focus; re-check once it has settled.
      window.setTimeout(sync, 300)
    }

    sync()
    vv.addEventListener("resize", sync)
    vv.addEventListener("scroll", sync)
    document.addEventListener("focusin", onFocusIn)
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener("resize", sync)
      vv.removeEventListener("scroll", sync)
      document.removeEventListener("focusin", onFocusIn)
      root.style.removeProperty("--app-height")
    }
  }, [])

  return null
}
