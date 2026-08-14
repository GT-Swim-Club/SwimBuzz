"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { StatCounter, StatSpotlight } from "@/lib/meet-stats"

function AnimatedStatValue({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const updateValue = () => setDisplayValue(value)

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frameRef.current = requestAnimationFrame(updateValue)
      return () => {
        if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      }
    }

    const duration = Math.min(2400, Math.max(1500, 1500 + Math.log10(value + 1) * 320))
    const startedAt = performance.now()

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(value * easedProgress))

      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [value])

  return <span aria-hidden>{displayValue}</span>
}

function SpotlightLine({ spotlight }: { spotlight: StatSpotlight }) {
  const { text, href, linkLabel } = spotlight
  if (href && linkLabel && text.includes(linkLabel)) {
    const idx = text.indexOf(linkLabel)
    const before = text.slice(0, idx)
    const after = text.slice(idx + linkLabel.length)
    return (
      <p className="text-sm text-foreground-secondary">
        {before}
        <Link
          href={href}
          className="font-medium text-foreground transition-colors hover:text-primary"
        >
          {linkLabel}
        </Link>
        {after}
      </p>
    )
  }
  if (href) {
    return (
      <p className="text-sm text-foreground-secondary">
        <Link
          href={href}
          className="font-medium text-foreground transition-colors hover:text-primary"
        >
          {text}
        </Link>
      </p>
    )
  }
  return <p className="text-sm text-foreground-secondary">{text}</p>
}

function HighlightUnit({ counter }: { counter: StatCounter }) {
  const value = String(counter.value)
  const compact = value.length > 5
  const numericValue = typeof counter.value === "number" && Number.isFinite(counter.value) ? counter.value : null

  return (
    <div className="flex min-w-[7.5rem] flex-1 flex-col items-center">
      <span
        className={`inline-flex min-h-[3.25rem] w-full items-center justify-center rounded-lg bg-background/90 px-4 py-2.5 font-semibold tabular-nums tracking-tight text-foreground shadow-sm ring-1 ring-black/5 dark:bg-fill-secondary dark:ring-white/10 ${
          compact ? "text-center text-base leading-tight sm:text-lg" : "text-2xl"
        }`}
        aria-label={numericValue != null ? `${numericValue} ${counter.label}` : undefined}
      >
        {numericValue != null ? <AnimatedStatValue value={numericValue} /> : value}
      </span>
      <span className="mt-1.5 text-center text-[11px] font-medium uppercase leading-tight tracking-wide text-foreground-tertiary">
        {counter.label}
      </span>
      {counter.hint ? (
        <span className="mt-0.5 text-center text-xs text-foreground-tertiary/80">
          {counter.hint}
        </span>
      ) : null}
    </div>
  )
}

export default function StatsHighlights({
  title,
  counters,
  spotlight,
  className = "",
}: {
  title: string
  counters: StatCounter[]
  spotlight?: StatSpotlight | null
  className?: string
}) {
  if (counters.length === 0) return null

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border border-border bg-fill-secondary/60 px-4 py-3.5 shadow-sm dark:bg-fill-secondary/40 ${className}`.trim()}
    >
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-4">
        {counters.map((c) => (
          <HighlightUnit key={c.label} counter={c} />
        ))}
      </div>
      {spotlight?.text ? <SpotlightLine spotlight={spotlight} /> : null}
    </section>
  )
}
