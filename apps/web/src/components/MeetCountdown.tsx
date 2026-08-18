"use client"

import { useEffect, useRef, useState } from "react"
import { DEFAULT_TIME_ZONE, zonedTimeToUtc } from "@swimbuzz/shared"

/**
 * Resolve a meet's UTC-midnight startDate + wall-clock startTime into the actual instant
 * it represents, interpreting startTime in the meet's own timeZone (not the viewer's) so the
 * countdown is correct for every viewer regardless of their device's time zone.
 */
export function meetStartDateTime(
  startDate: Date | string,
  startTime: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE
): Date | null {
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return null
  const day = new Date(startDate).toISOString().slice(0, 10)
  const target = zonedTimeToUtc(day, startTime, timeZone)
  if (isNaN(target.getTime())) return null
  return target
}

type Parts = { days: number; hours: number; minutes: number; seconds: number }

function splitCountdown(ms: number): Parts {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

type Variant = "pill" | "inline" | "banner"
type Tone = "default" | "onDark"

const upcomingPillClass =
  "text-[10px] uppercase font-semibold tracking-wide rounded-full bg-primary/90 text-primary-text px-2 py-0.5"

function AnimatedCountdownValue({ value }: { value: string }) {
  const targetValue = Number(value)
  const [displayValue, setDisplayValue] = useState(0)
  const latestTargetRef = useRef(targetValue)
  const hasPlayedRef = useRef(false)
  const frameRef = useRef<number | null>(null)

  // This effect deliberately runs only once: it is the page-entry reveal.
  useEffect(() => {
    const initialTarget = latestTargetRef.current
    if (!Number.isFinite(initialTarget)) return

    const finish = () => {
      hasPlayedRef.current = true
      setDisplayValue(latestTargetRef.current)
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frameRef.current = requestAnimationFrame(finish)
      return () => {
        if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
      }
    }

    if (initialTarget === 0) {
      hasPlayedRef.current = true
      return
    }

    const duration = 1400
    const startedAt = performance.now()
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(initialTarget * easedProgress))

      if (progress < 1) frameRef.current = requestAnimationFrame(animate)
      else finish()
    }

    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  // After the initial reveal, live timer changes update directly with no count-up.
  useEffect(() => {
    if (!Number.isFinite(targetValue)) return
    latestTargetRef.current = targetValue
    if (!hasPlayedRef.current) return

    const frameId = requestAnimationFrame(() => setDisplayValue(targetValue))
    return () => cancelAnimationFrame(frameId)
  }, [targetValue])

  return <span aria-hidden>{String(displayValue).padStart(value.length, "0")}</span>
}

function Unit({
  value,
  label,
  size,
  tone,
  expand = false,
}: {
  value: string
  label: string
  size: "sm" | "md"
  tone: Tone
  expand?: boolean
}) {
  const box =
    size === "md"
      ? expand
        ? "w-full min-h-[3.25rem] px-2 py-2 text-xl sm:text-2xl"
        : "min-w-[3.25rem] px-2.5 py-2 text-xl sm:min-w-[3.75rem] sm:text-2xl"
      : "min-w-[1.5rem] px-0.5 py-0.5 text-[10px] leading-tight"
  const labelSize = size === "md" ? "text-[10px] mt-1.5" : "text-[7px] mt-0.5"
  const boxTone =
    tone === "onDark"
      ? "bg-white/12 text-white ring-1 ring-white/15"
      : "bg-background/90 text-foreground shadow-sm ring-1 ring-black/5 dark:bg-fill-secondary dark:ring-white/10"
  const labelTone =
    tone === "onDark" ? "text-white/55" : "text-foreground-tertiary"
  return (
    <div className={`flex flex-col items-center ${expand ? "min-w-0 flex-1" : ""}`}>
      <span
        className={`flex items-center justify-center rounded-md font-semibold tabular-nums tracking-tight ${box} ${boxTone}`}
        aria-label={`${value} ${label}`}
      >
        <AnimatedCountdownValue value={value} />
      </span>
      <span className={`uppercase tracking-[0.14em] font-medium ${labelSize} ${labelTone}`}>
        {label}
      </span>
    </div>
  )
}

function Separator({
  size,
  tone,
  expand = false,
}: {
  size: "sm" | "md"
  tone: Tone
  expand?: boolean
}) {
  return (
    <span
      className={`shrink-0 font-semibold tabular-nums ${
        expand && size === "md"
          ? "flex h-[3.25rem] items-center text-xl sm:text-2xl"
          : size === "md"
            ? "self-start pt-2 text-xl sm:text-2xl"
            : "self-start pt-0.5 text-[10px]"
      } ${tone === "onDark" ? "text-white/40" : "text-foreground-tertiary"}`}
      aria-hidden
    >
      :
    </span>
  )
}

function CountdownUnits({
  parts,
  size,
  tone = "default",
  expand = false,
  className = "",
}: {
  parts: Parts
  size: "sm" | "md"
  tone?: Tone
  expand?: boolean
  className?: string
}) {
  const showDays = parts.days > 0
  const gap = size === "md" ? "gap-2 sm:gap-2.5" : "gap-1"

  return (
    <div
      className={`${expand ? "flex w-full" : "inline-flex"} items-start ${gap} ${className}`.trim()}
    >
      {showDays && (
        <>
          <Unit
            value={String(parts.days)}
            label={parts.days === 1 ? "day" : "days"}
            size={size}
            tone={tone}
            expand={expand}
          />
          <Separator size={size} tone={tone} expand={expand} />
        </>
      )}
      <Unit value={pad(parts.hours)} label="hrs" size={size} tone={tone} expand={expand} />
      <Separator size={size} tone={tone} expand={expand} />
      <Unit value={pad(parts.minutes)} label="min" size={size} tone={tone} expand={expand} />
      <Separator size={size} tone={tone} expand={expand} />
      <Unit value={pad(parts.seconds)} label="sec" size={size} tone={tone} expand={expand} />
    </div>
  )
}

export default function MeetCountdown({
  startDate,
  startTime,
  timeZone,
  upcoming = true,
  variant = "pill",
  className = "",
}: {
  startDate: Date | string
  startTime: string | null | undefined
  /** IANA zone startTime is a wall-clock time in; defaults to the club's home zone. */
  timeZone?: string | null
  /** When true and countdown isn't active, show the Upcoming pill (pill variant only). */
  upcoming?: boolean
  variant?: Variant
  className?: string
}) {
  const targetMs = meetStartDateTime(startDate, startTime, timeZone ?? undefined)?.getTime() ?? null
  // null until mounted to avoid SSR/client clock hydration mismatches
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (targetMs == null) return
    const frameId = window.requestAnimationFrame(() => setNow(Date.now()))
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearInterval(id)
    }
  }, [targetMs])

  const remaining = targetMs != null && now !== null ? targetMs - now : 0
  const active = Boolean(targetMs != null && now !== null && remaining > 0)

  if (active) {
    const parts = splitCountdown(remaining)

    if (variant === "banner") {
      return (
        <div
          className={`flex w-full flex-col gap-3 rounded-2xl border border-border bg-fill-secondary/60 px-4 py-3.5 shadow-sm dark:bg-fill-secondary/40 ${className}`.trim()}
        >
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Starts in
          </span>
          <CountdownUnits parts={parts} size="md" expand />
        </div>
      )
    }

    if (variant === "inline") {
      return (
        <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
          <span className="text-xs text-foreground-secondary">Starts in</span>
          <CountdownUnits parts={parts} size="sm" />
        </span>
      )
    }

    // Compact glass chip for list / gallery overlays
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.75 shadow-sm backdrop-blur-md ring-1 ring-white/15 ${className}`.trim()}
      >
        <span
          className="h-1 w-1 shrink-0 rounded-full bg-primary animate-pulse"
          aria-hidden
        />
        <CountdownUnits parts={parts} size="sm" tone="onDark" />
      </span>
    )
  }

  // No active countdown — optional Upcoming pill for list/gallery
  if (upcoming && variant === "pill") {
    return <span className={`${upcomingPillClass} ${className}`.trim()}>Upcoming</span>
  }

  return null
}
