import { Pressable, Text, type TextStyle } from "react-native"
import {
  DEFAULT_TIME_ZONE,
  describeZones,
  formatClockTime,
  getViewerTimeZone,
  localDayKey,
  relativeEventDayLabel,
  relativeInstantDayLabel,
} from "@swimbuzz/shared"
import { useToast } from "@swimbuzz/ui"
import { formatZoneDescriptionMessage } from "./ZonedTimeText"

/**
 * Displays a date as "Yesterday"/"Today"/"Tomorrow" when it's within a day of the
 * viewer's current date, else the caller-supplied `absolute` text. Mobile has no
 * hover, so the full zone detail is always reached by tapping — the tap raises a
 * toast (see ToastProvider in @swimbuzz/ui, mounted in app/_layout.tsx) with the
 * same describeZones detail ZonedTimeText shows (the record's zone, plus the
 * viewer's zone too when it differs), regardless of whether a relative label
 * applied — matching web's HoverDetail reveal in RelativeDate.tsx.
 *
 * `kind` picks the day-key math and the zone used for the tap detail:
 * - "event": a true scheduled instant (Practice.startsAt/Meet.startsAt) — pass its
 *   stored `timeZone`; the relative label and detail are evaluated in that zone.
 * - "instant": a system timestamp (createdAt, closeAt) with no meaningful record
 *   zone — evaluated in the viewer's zone, compared against the club default in the
 *   tap detail (mirrors describeZones' documented system-instant usage).
 *
 * `endValue` is optional and only used to extend the tap detail into a range (e.g.
 * a practice's end time) — omit it for a single point in time.
 */
export function RelativeDateText({
  value,
  kind,
  timeZone,
  endValue,
  absolute,
  style,
}: {
  value: Date | string
  kind: "event" | "instant"
  timeZone?: string
  endValue?: Date | string | null
  absolute: string
  style?: TextStyle
}) {
  const { showToast } = useToast()
  const todayKey = localDayKey(new Date())
  const sourceTimeZone = timeZone ?? DEFAULT_TIME_ZONE
  const relativeDay =
    kind === "event"
      ? relativeEventDayLabel(value, sourceTimeZone, todayKey)
      : relativeInstantDayLabel(value, todayKey)

  const instant = value instanceof Date ? value : new Date(value)
  const label =
    relativeDay && kind === "instant" ? `${relativeDay} at ${formatClockTime(instant)}` : relativeDay

  const description =
    kind === "event"
      ? describeZones(value, endValue, sourceTimeZone)
      : describeZones(value, endValue, getViewerTimeZone(), DEFAULT_TIME_ZONE)

  return (
    <Pressable
      onPress={() => showToast(formatZoneDescriptionMessage(description))}
      hitSlop={8}
    >
      <Text style={style}>{label ?? absolute}</Text>
    </Pressable>
  )
}
