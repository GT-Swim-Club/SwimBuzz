"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import {
  DEFAULT_TIME_ZONE,
  formatClockTimeInViewerZone,
  formatClockTimeRangeInViewerZone,
  getViewerTimeZone,
  zoneAbbreviation,
  zoneDisplayName,
} from "@swimbuzz/shared"
import HoverDetail from "@/components/HoverDetail"

function isoDate(value: string | null | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Date().toISOString().slice(0, 10)
}

function noopSubscribe() {
  return () => {}
}

/**
 * The server can't know the browser's zone, so SSR/first paint uses the club's
 * default zone and swaps to the real viewer zone once mounted — avoids a
 * hydration mismatch between the server-rendered and client-rendered text.
 */
export function useViewerTimeZone(): string {
  return useSyncExternalStore(noopSubscribe, getViewerTimeZone, () => DEFAULT_TIME_ZONE)
}

/**
 * Displays a Practice/Meet wall-clock time (or start–end range) converted from the
 * record's own `sourceTimeZone` into the viewer's current time zone, with a hover
 * tooltip naming that zone. Pass `endTime` for a range, omit it for a single time.
 */
export function ZonedClockTime({
  date,
  startTime,
  endTime,
  sourceTimeZone,
  className,
}: {
  date: string | null | undefined
  startTime: string
  endTime?: string | null
  sourceTimeZone: string
  className?: string
}) {
  const viewerTimeZone = useViewerTimeZone()
  const effectiveDate = isoDate(date)
  const result = endTime
    ? formatClockTimeRangeInViewerZone(effectiveDate, startTime, endTime, sourceTimeZone, viewerTimeZone)
    : formatClockTimeInViewerZone(effectiveDate, startTime, sourceTimeZone, viewerTimeZone)
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {result.text}
      <HoverDetail label={`${result.zoneName} (${result.abbrev})`} />
    </span>
  )
}

/**
 * Wraps already-formatted text derived from a true instant (e.g. formatClockTime/
 * formatDateTime output for createdAt, recordedAt, openAt/closeAt) with a hover
 * tooltip naming the viewer's current time zone, since those values already render
 * in the browser's local zone natively — they just need the label.
 */
export function ZonedInstantTime({
  children,
  at,
  className,
}: {
  children: ReactNode
  at?: Date | string | null
  className?: string
}) {
  const viewerTimeZone = useViewerTimeZone()
  const instant = at ? new Date(at) : new Date()
  const validInstant = Number.isNaN(instant.getTime()) ? new Date() : instant
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {children}
      <HoverDetail
        label={`${zoneDisplayName(viewerTimeZone, validInstant)} (${zoneAbbreviation(viewerTimeZone, validInstant)})`}
      />
    </span>
  )
}
