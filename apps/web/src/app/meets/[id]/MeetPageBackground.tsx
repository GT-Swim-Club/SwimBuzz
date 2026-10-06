"use client"

import { useEffect, useState } from "react"

type MeetPageBackgroundProps = {
  bannerUrl: string
}

type Frame = { top: number; left: number; width: number; height: number }

/**
 * Meet banner as a fixed page background. It's pinned to the visible `#page-scroll`
 * area (below the nav, excluding its scrollbar), so it fills the page however short
 * the content is and stays put while the page scrolls.
 */
export default function MeetPageBackground({ bannerUrl }: MeetPageBackgroundProps) {
  const [frame, setFrame] = useState<Frame | null>(null)

  useEffect(() => {
    const scroller = document.getElementById("page-scroll")
    if (!scroller) return

    function measure() {
      const rect = scroller!.getBoundingClientRect()
      setFrame({
        top: rect.top,
        left: rect.left,
        width: scroller!.clientWidth,
        height: scroller!.clientHeight,
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  if (!frame) return null

  return (
    <div className="pointer-events-none fixed overflow-hidden" style={frame} aria-hidden>
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: `url(${bannerUrl})` }}
      />
      <div className="absolute inset-0 bg-background/70 dark:bg-background/90" />
    </div>
  )
}
