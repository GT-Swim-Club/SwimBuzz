"use client"

import { useEffect, useState } from "react"

/**
 * Tracks whether a scroll container has content below its current scroll
 * position — e.g. to show a modal footer divider only while there's more to
 * scroll to. Pass the returned ref callback to the scroll container.
 */
export function useCanScrollDown<T extends HTMLElement = HTMLDivElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [canScrollDown, setCanScrollDown] = useState(false)

  useEffect(() => {
    if (!el) return
    const update = () => setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
    const resizeObserver = new ResizeObserver(update)
    // Content growing/shrinking doesn't resize the container itself, so watch
    // its children too (re-observing when they're added or removed).
    const observeChildren = () => {
      resizeObserver.disconnect()
      resizeObserver.observe(el)
      for (const child of Array.from(el.children)) resizeObserver.observe(child)
      update()
    }
    const mutationObserver = new MutationObserver(observeChildren)
    mutationObserver.observe(el, { childList: true })
    observeChildren()
    el.addEventListener("scroll", update, { passive: true })
    return () => {
      el.removeEventListener("scroll", update)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [el])

  return [setEl, el ? canScrollDown : false] as const
}
