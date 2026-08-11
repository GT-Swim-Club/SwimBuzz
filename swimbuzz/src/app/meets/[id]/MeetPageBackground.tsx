"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type MeetPageBackgroundProps = {
  bannerUrl: string
  photoUrls: string[]
}

export default function MeetPageBackground({
  bannerUrl,
  photoUrls,
}: MeetPageBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cycleRef = useRef<HTMLDivElement>(null)
  const [repeatCount, setRepeatCount] = useState(1)

  const hasPhotos = photoUrls.length > 0
  const cycleUrls = hasPhotos ? [bannerUrl, ...photoUrls] : [bannerUrl]

  const updateRepeatCount = useCallback(() => {
    const container = containerRef.current
    const cycle = cycleRef.current
    if (!container || !cycle) return

    const cycleHeight = cycle.offsetHeight
    const containerHeight = container.offsetHeight
    if (cycleHeight > 0 && containerHeight > 0) {
      setRepeatCount(Math.max(1, Math.ceil(containerHeight / cycleHeight) + 1))
    }
  }, [])

  useEffect(() => {
    updateRepeatCount()

    const container = containerRef.current
    const cycle = cycleRef.current
    if (!container || !cycle) return

    const observer = new ResizeObserver(updateRepeatCount)
    observer.observe(container)
    observer.observe(cycle)

    return () => observer.disconnect()
  }, [updateRepeatCount, bannerUrl, photoUrls])

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute -top-6 -bottom-6 left-1/2 w-screen -translate-x-1/2 overflow-hidden sm:-top-8 sm:-bottom-8"
      aria-hidden
    >
      {hasPhotos ? (
        <div className="absolute inset-0 opacity-40">
          {Array.from({ length: repeatCount }, (_, rep) => (
            <div key={rep} ref={rep === 0 ? cycleRef : undefined}>
              {cycleUrls.map((url, i) => (
                <img
                  key={`${rep}-${url}-${i}`}
                  src={url}
                  alt=""
                  className="block w-full h-auto"
                  onLoad={updateRepeatCount}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: `url(${bannerUrl})`,
            backgroundSize: "100% auto",
            backgroundRepeat: "repeat-y",
            backgroundPosition: "top center",
          }}
        />
      )}
      <div className="absolute inset-0 bg-background/70 dark:bg-background/90" />
    </div>
  )
}
