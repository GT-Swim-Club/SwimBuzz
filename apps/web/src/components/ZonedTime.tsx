"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import {
  DEFAULT_TIME_ZONE,
  describeZones,
  formatZonedInstantRange,
  getViewerTimeZone,
  type ZoneDescription,
} from "@swimbuzz/shared"
import HoverDetail from "@/components/HoverDetail"

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

/** One hover-tooltip line per zone block, e.g. "August 21, 2026, 7:30 – 9:00 PM EDT". */
export function zoneDescriptionLines(description: ZoneDescription): string[] {
  return description.blocks.map((block) => `${block.dateTime} ${block.abbrev}`)
}

/**
 * Displays a Practice/Meet wall-clock time (or start–end range) in the record's own
 * `timeZone` — never converted into the viewer's zone — with the zone abbreviation
 * appended (e.g. "10:30 PM – 1:00 AM EDT") and a hover tooltip showing both the
 * record's zone and the viewer's zone (via `describeZones`) when they differ.
 */
export function ZonedClockTime({
  startsAt,
  endsAt,
  timeZone,
  className,
}: {
  startsAt: string | Date
  endsAt?: string | Date | null
  timeZone: string
  className?: string
}) {
  const viewerTimeZone = useViewerTimeZone()
  const range = formatZonedInstantRange(startsAt, endsAt, timeZone)
  const zones = describeZones(startsAt, endsAt, timeZone)
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {range.time}
      {viewerTimeZone !== timeZone ? ` ${range.abbrev}` : ""}
      <HoverDetail label={zoneDescriptionLines(zones)} />
    </span>
  )
}

/**
 * Wraps already-formatted text derived from a true instant (e.g. formatClockTime/
 * formatDateTime output for createdAt, recordedAt, openAt/closeAt) with a hover
 * tooltip. Those values already render in the browser's local zone natively — the
 * tooltip names that zone, plus the club's default zone when they differ, via
 * `describeZones`.
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
  const zones = describeZones(validInstant, null, viewerTimeZone, DEFAULT_TIME_ZONE)
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {children}
      <HoverDetail label={zoneDescriptionLines(zones)} />
    </span>
  )
}
