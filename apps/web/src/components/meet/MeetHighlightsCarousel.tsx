"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { StatCounter } from "@/lib/meet/meet-stats"
import { LedgerIcon, LedgerPanel, LedgerStatTile } from "./Ledger"

const AUTOPLAY_MS = 6000

/** Plain counters share a page three-up; counters with a hint line get more room. */
function paginate(counters: StatCounter[]): StatCounter[][] {
  const plain = counters.filter((c) => !c.hint)
  const hinted = counters.filter((c) => c.hint)
  const pages: StatCounter[][] = []
  for (let i = 0; i < plain.length; i += 3) pages.push(plain.slice(i, i + 3))
  for (let i = 0; i < hinted.length; i += 2) pages.push(hinted.slice(i, i + 2))
  return pages
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let frame = 0
    if (prefersReducedMotion()) {
      frame = requestAnimationFrame(() => setDisplay(value))
      return () => cancelAnimationFrame(frame)
    }
    const duration = Math.min(2400, Math.max(1500, 1500 + Math.log10(value + 1) * 320))
    const startedAt = performance.now()
    const step = (now: number) => {
      // rAF timestamps can precede startedAt on the first frame; clamp so values never go negative.
      const p = Math.min(Math.max((now - startedAt) / duration, 0), 1)
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <>
      <span aria-hidden>{display}</span>
      <span className="sr-only">{value}</span>
    </>
  )
}

function isDropValue(value: string | number) {
  return typeof value === "string" && /^[-−]/.test(value)
}

export default function MeetHighlightsCarousel({ counters }: { counters: StatCounter[] }) {
  const pages = paginate(counters)
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)
  const pausedRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const pageCount = pages.length

  const restart = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    if (pageCount <= 1) return
    timerRef.current = window.setInterval(() => {
      if (!pausedRef.current && !document.hidden) {
        setIndex((i) => (i + 1) % pageCount)
      }
    }, AUTOPLAY_MS)
  }, [pageCount])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReduced(prefersReducedMotion()))
    restart()
    return () => {
      cancelAnimationFrame(frame)
      if (timerRef.current != null) window.clearInterval(timerRef.current)
    }
  }, [restart])

  if (pageCount === 0) return null
  const current = index % pageCount

  const go = (next: number) => {
    setIndex((next + pageCount) % pageCount)
    restart()
  }

  return (
    <LedgerPanel
      label="Highlights"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      labelExtra={
        pageCount > 1 ? (
          <div className="flex items-center gap-[5px]">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show highlights ${i + 1} of ${pageCount}`}
                onClick={() => go(i)}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === current ? "bg-accent" : "bg-fill dark:bg-foreground-quaternary"
                }`}
              />
            ))}
          </div>
        ) : null
      }
      aside={
        pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous highlights"
              onClick={() => go(current - 1)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill hover:text-foreground"
            >
              <LedgerIcon name="chevronLeft" />
            </button>
            <button
              type="button"
              aria-label="Next highlights"
              onClick={() => go(current + 1)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill hover:text-foreground"
            >
              <LedgerIcon name="chevronRight" />
            </button>
          </div>
        ) : null
      }
    >
      <div className="overflow-hidden">
        <div
          className="flex"
          style={{
            transform: `translateX(-${current * 100}%)`,
            transition: reduced ? "none" : "transform 300ms cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              aria-hidden={i !== current}
              className="grid min-w-0 flex-[0_0_100%] gap-2"
              style={{ gridTemplateColumns: `repeat(${page.length}, minmax(0, 1fr))` }}
            >
              {page.map((c) => (
                <LedgerStatTile
                  key={c.label}
                  label={c.label}
                  sub={c.hint}
                  fit={typeof c.value === "string" && !/^[-−+]?[\d.:]+$/.test(c.value)}
                  value={
                    typeof c.value === "number" && Number.isFinite(c.value) ? (
                      <CountUp value={c.value} />
                    ) : (
                      c.value
                    )
                  }
                  valueClassName={
                    isDropValue(c.value)
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </LedgerPanel>
  )
}
