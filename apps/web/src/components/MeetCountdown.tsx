"use client"

import { useEffect, useState } from "react"

/** Build a local Date from a meet's UTC-midnight startDate + optional HH:mm startTime. */
export function meetStartDateTime(
  startDate: Date | string,
  startTime: string | null | undefined
): Date | null {
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return null
  const day = new Date(startDate).toISOString().slice(0, 10)
  const target = new Date(`${day}T${startTime}:00`)
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

function Unit({
  value,
  label,
  size,
  tone,
}: {
  value: string
  label: string
  size: "sm" | "md"
  tone: Tone
}) {
  const box =
    size === "md"
      ? "min-w-[2.75rem] px-2 py-1.5 text-lg sm:min-w-[3.25rem] sm:text-xl"
      : "min-w-[1.65rem] px-1 py-0.5 text-[11px] leading-tight"
  const labelSize = size === "md" ? "text-[9px] mt-1" : "text-[8px] mt-0.5"

  const boxTone =
    tone === "onDark"
      ? "bg-white/12 text-white ring-1 ring-white/15"
      : "bg-background/90 text-foreground shadow-sm ring-1 ring-black/5 dark:bg-fill-secondary dark:ring-white/10"
  const labelTone =
    tone === "onDark" ? "text-white/55" : "text-foreground-tertiary"

  return (
    <div className="flex flex-col items-center">
      <span
        className={`inline-flex items-center justify-center rounded-md font-semibold tabular-nums tracking-tight ${box} ${boxTone}`}
      >
        {value}
      </span>
      <span className={`uppercase tracking-[0.14em] font-medium ${labelSize} ${labelTone}`}>
        {label}
      </span>
    </div>
  )
}

function Separator({ size, tone }: { size: "sm" | "md"; tone: Tone }) {
  return (
    <span
      className={`self-start font-semibold tabular-nums ${
        size === "md" ? "pt-1.5 text-lg sm:text-xl" : "pt-0.5 text-[11px]"
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
  className = "",
}: {
  parts: Parts
  size: "sm" | "md"
  tone?: Tone
  className?: string
}) {
  const showDays = parts.days > 0
  const gap = size === "md" ? "gap-1.5 sm:gap-2" : "gap-1"

  return (
    <div className={`inline-flex items-start ${gap} ${className}`.trim()}>
      {showDays && (
        <>
          <Unit
            value={String(parts.days)}
            label={parts.days === 1 ? "day" : "days"}
            size={size}
            tone={tone}
          />
          <Separator size={size} tone={tone} />
        </>
      )}
      <Unit value={pad(parts.hours)} label="hrs" size={size} tone={tone} />
      <Separator size={size} tone={tone} />
      <Unit value={pad(parts.minutes)} label="min" size={size} tone={tone} />
      <Separator size={size} tone={tone} />
      <Unit value={pad(parts.seconds)} label="sec" size={size} tone={tone} />
    </div>
  )
}

export default function MeetCountdown({
  startDate,
  startTime,
  upcoming = true,
  variant = "pill",
  className = "",
}: {
  startDate: Date | string
  startTime: string | null | undefined
  /** When true and countdown isn't active, show the Upcoming pill (pill variant only). */
  upcoming?: boolean
  variant?: Variant
  className?: string
}) {
  const targetMs = meetStartDateTime(startDate, startTime)?.getTime() ?? null
  // null until mounted to avoid SSR/client clock hydration mismatches
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (targetMs == null) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [targetMs])

  const remaining = targetMs != null && now !== null ? targetMs - now : 0
  const active = Boolean(targetMs != null && now !== null && remaining > 0)

  if (active) {
    const parts = splitCountdown(remaining)

    if (variant === "banner") {
      return (
        <div
          className={`inline-flex flex-col gap-2 rounded-xl border border-border bg-fill-secondary/60 px-3 py-2.5 dark:bg-fill-secondary/40 ${className}`.trim()}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Starts in
          </span>
          <CountdownUnits parts={parts} size="md" />
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
        className={`inline-flex items-center gap-1.5 rounded-lg bg-black/70 px-2 py-1 shadow-sm backdrop-blur-md ring-1 ring-white/15 ${className}`.trim()}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse"
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
