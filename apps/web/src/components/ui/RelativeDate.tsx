"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import {
  describeMeetSchedule,
  describeZones,
  formatDateTime,
  formatMeetDateRange,
  formatMeetDateRangeFull,
  formatZonedInstant,
  formatZonedInstantRange,
  localDayKey,
  relativeEventDayLabel,
  relativeInstantDayLabel,
  zoneAbbreviation,
  zoneDisplayName,
  zonedDayKey,
} from "@swimbuzz/shared"
import HoverDetail from "@/components/ui/HoverDetail"
import { useViewerTimeZone, zoneDescriptionLines } from "@/components/ui/ZonedTime"

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
 * Displays a Practice/Meet `startsAt` instant as "Yesterday"/"Today"/"Tomorrow" when
 * within a day of the viewer's current date (evaluated in the record's own `timeZone`),
 * with a hover tooltip showing the absolute date. Falls back to plain absolute text —
 * no wrapper, no tooltip — when there's nothing to reveal.
 */
export function RelativeDate({
  startsAt,
  timeZone,
  className,
}: {
  startsAt: string | Date
  timeZone: string
  className?: string
}) {
  const todayKey = useTodayKey()
  const relative = relativeEventDayLabel(startsAt, timeZone, todayKey)
  const absolute = formatZonedInstant(startsAt, timeZone).date
  if (!relative) return <>{absolute}</>
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {relative}
      <HoverDetail label={absolute} />
    </span>
  )
}

/**
 * Displays a Practice's date and time together as a single hoverable unit — the date
 * (relative or absolute) followed by the time range, both inside one hover target so
 * hovering the date or the time reveals the same full date/time/zone detail. Replaces
 * the `<RelativeDate/> · <ZonedClockTime/>` pairing, which previously exposed two
 * separate hover targets for what is really one piece of information.
 */
export function RelativeDateTime({
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
  const todayKey = useTodayKey()
  const viewerTimeZone = useViewerTimeZone()
  const relative = relativeEventDayLabel(startsAt, timeZone, todayKey)
  const range = formatZonedInstantRange(startsAt, endsAt, timeZone)
  const dateText = relative ?? range.date
  const zones = describeZones(startsAt, endsAt, timeZone)
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {dateText} · {range.time}
      {viewerTimeZone !== timeZone ? ` ${range.abbrev}` : ""}
      <HoverDetail label={zoneDescriptionLines(zones)} />
    </span>
  )
}

/**
 * Layout-agnostic version of `RelativeDateTime` for callers that need the date and
 * time rendered as separate rows (e.g. with their own icons) while still sharing one
 * hover target between them. `dateIcon`/`timeIcon` are rendered ahead of the formatted
 * date and time text on their own row; hovering either reveals the same full
 * date/time/zone detail. Icons are plain nodes (not a render-prop) so this stays a
 * Server-Component-renderable Client Component — a function child can't cross that
 * boundary as a prop.
 */
export function DateTimeHoverGroup({
  startsAt,
  endsAt,
  timeZone,
  className,
  dateIcon,
  timeIcon,
}: {
  startsAt: string | Date
  endsAt?: string | Date | null
  timeZone: string
  className?: string
  dateIcon?: ReactNode
  timeIcon?: ReactNode
}) {
  const todayKey = useTodayKey()
  const viewerTimeZone = useViewerTimeZone()
  const relative = relativeEventDayLabel(startsAt, timeZone, todayKey)
  const range = formatZonedInstantRange(startsAt, endsAt, timeZone)
  const dateText = relative ?? range.date
  const timeText = viewerTimeZone !== timeZone ? `${range.time} ${range.abbrev}` : range.time
  const zones = describeZones(startsAt, endsAt, timeZone)
  return (
    <div className={`group relative ${className ?? ""}`.trim()} tabIndex={0}>
      <div className="flex items-center justify-end gap-1.5 font-semibold">
        {dateIcon}
        {dateText}
      </div>
      <div className="flex items-center justify-end gap-1.5 font-semibold">
        {timeIcon}
        {timeText}
      </div>
      <HoverDetail label={zoneDescriptionLines(zones)} />
    </div>
  )
}

/**
 * Displays a Meet's `startsAt`–`endsAt` date range. Only single-day meets (no `endsAt`,
 * or an `endsAt` on the same calendar day as `startsAt` in the meet's own `timeZone`)
 * collapse to a relative label — a multi-day meet always keeps its absolute range,
 * since "Today" would silently drop the end date.
 */
export function RelativeDateRange({
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
  const todayKey = useTodayKey()
  const singleDay = !endsAt || zonedDayKey(startsAt, timeZone) === zonedDayKey(endsAt, timeZone)
  const relative = singleDay ? relativeEventDayLabel(startsAt, timeZone, todayKey) : null
  if (!relative) return <>{formatMeetDateRange(startsAt, endsAt, timeZone)}</>
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {relative}
      <HoverDetail label={formatMeetDateRangeFull(startsAt, endsAt, timeZone)} />
    </span>
  )
}

/**
 * Displays a Meet's date range and, when the meet has a real start time, its time
 * too — both inside one hover target, so hovering the date or the time reveals the
 * same full detail. A meet never has a real end time (only an optional end date for
 * multi-day meets), so the hover (via `describeMeetSchedule`) always spans the full
 * `startsAt`–`endsAt` date range and only adds a start time when `hasStartTime` is true.
 */
export function RelativeDateRangeTime({
  startsAt,
  endsAt,
  timeZone,
  hasStartTime,
  className,
}: {
  startsAt: string | Date
  endsAt?: string | Date | null
  timeZone: string
  hasStartTime: boolean
  className?: string
}) {
  const todayKey = useTodayKey()
  const viewerTimeZone = useViewerTimeZone()
  const singleDay = !endsAt || zonedDayKey(startsAt, timeZone) === zonedDayKey(endsAt, timeZone)
  const relative = singleDay ? relativeEventDayLabel(startsAt, timeZone, todayKey) : null
  const dateText = relative ?? formatMeetDateRange(startsAt, endsAt, timeZone)
  const hoverLines = describeMeetSchedule(startsAt, endsAt, hasStartTime, timeZone)
  if (!hasStartTime) {
    if (!relative) return <>{dateText}</>
    return (
      <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
        {dateText}
        <HoverDetail label={hoverLines} />
      </span>
    )
  }
  const start = formatZonedInstant(startsAt, timeZone)
  return (
    <span className={`group relative inline-block ${className ?? ""}`.trim()} tabIndex={0}>
      {dateText} · {start.time}
      {viewerTimeZone !== timeZone ? ` ${start.abbrev}` : ""}
      <HoverDetail label={hoverLines} />
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
