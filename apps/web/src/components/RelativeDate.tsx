"use client"

import { useSyncExternalStore } from "react"
import {
  localDayKey,
  relativeEventDayLabel,
  relativeInstantDayLabel,
  utcDayKey,
  zoneAbbreviation,
  zoneDisplayName,
} from "@swimbuzz/shared"
import { formatDateTime } from "@/lib/utils"
import HoverDetail from "@/components/HoverDetail"
import { useViewerTimeZone } from "@/components/ZonedTime"

function noopSubscribe() {
  return () => {}
}

/**
 * The server has no idea what day it is for the viewer (Vercel runs UTC, and even
 * a US server's local day can differ from the viewer's), so the SSR snapshot is ""
 * — relativeEventDayLabel/relativeInstantDayLabel return null for an empty key, SSR
 * renders the absolute date, and the client swaps in the relative label on mount.
 * Same useSyncExternalStore trick as useViewerTimeZone in ZonedTime.tsx.
 */
export function useTodayKey(): string {
  return useSyncExternalStore(noopSubscribe, () => localDayKey(new Date()), () => "")
}

/**
 * Displays a date-only value (practice/meet date, stored at UTC midnight) as
 * "Yesterday"/"Today"/"Tomorrow" when within a day of the viewer's current date,
 * with a hover tooltip showing the absolute date. Falls back to plain absolute
 * text — no wrapper, no tooltip — when there's nothing to reveal.
 */
export function RelativeDate({
  day,
  absolute,
  className,
}: {
  day: string | Date
  absolute: string
  className?: string
}) {
  const todayKey = useTodayKey()
  const relative = relativeEventDayLabel(day, todayKey)
  if (!relative) return <>{absolute}</>
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {relative}
      <HoverDetail label={absolute} />
    </span>
  )
}

/**
 * Displays a meet date range. Only single-day meets (no end date, or an end date
 * on the same UTC day) collapse to a relative label — a multi-day meet always
 * keeps its absolute range, since "Today" would silently drop the end date.
 */
export function RelativeDateRange({
  start,
  end,
  absolute,
  className,
}: {
  start: string | Date
  end?: string | Date | null
  absolute: string
  className?: string
}) {
  const todayKey = useTodayKey()
  const singleDay = !end || utcDayKey(start) === utcDayKey(end)
  const relative = singleDay ? relativeEventDayLabel(start, todayKey) : null
  if (!relative) return <>{absolute}</>
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {relative}
      <HoverDetail label={absolute} />
    </span>
  )
}

/**
 * Displays a true instant (deadline: signup openAt/closeAt, withdrawUntil) as
 * "Today at 3:04 PM" / "Tomorrow at …" / "Yesterday at …" when within a day of the
 * viewer's current date, else the existing absolute formatDateTime output. The
 * hover tooltip carries the absolute value plus the viewer's zone name, so this is
 * a drop-in replacement for the `<ZonedInstantTime at={x}>{formatDateTime(x)}</ZonedInstantTime>`
 * pairing used at every deadline site — no zone information is lost.
 */
export function RelativeInstantTime({
  at,
  className,
}: {
  at: Date | string
  className?: string
}) {
  const todayKey = useTodayKey()
  const viewerTimeZone = useViewerTimeZone()
  const instant = at instanceof Date ? at : new Date(at)
  const validInstant = Number.isNaN(instant.getTime()) ? new Date() : instant
  const absolute = formatDateTime(validInstant)
  const relative = relativeInstantDayLabel(validInstant, todayKey)
  const zoneLabel = `${zoneDisplayName(viewerTimeZone, validInstant)} (${zoneAbbreviation(viewerTimeZone, validInstant)})`
  const time = absolute.split(", ").slice(-1)[0]
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {relative ? `${relative} at ${time}` : absolute}
      <HoverDetail label={relative ? `${absolute} · ${zoneLabel}` : zoneLabel} />
    </span>
  )
}
