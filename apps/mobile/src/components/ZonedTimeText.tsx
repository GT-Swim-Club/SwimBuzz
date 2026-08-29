import { Pressable, Text, type TextStyle } from "react-native"
import { describeZones, formatZonedInstantRange, type ZoneDescription } from "@swimbuzz/shared"
import { useToast } from "@swimbuzz/ui"

/**
 * Renders a ZoneDescription (from describeZones) as toast-friendly plain text — one
 * "<date/time> <abbrev>" line per block. Shared with RelativeDateText so both
 * components' tap detail reads identically.
 */
export function formatZoneDescriptionMessage(description: ZoneDescription): string {
  return description.blocks.map((block) => `${block.dateTime} ${block.abbrev}`).join("\n")
}

/**
 * Displays a Practice/Meet start time (or start–end range), rendered in the
 * record's own stored `timeZone` — not the viewer's — with the zone abbreviation
 * always visible (e.g. "7:30 – 9:00 PM EDT") since mobile has no hover to reveal it
 * otherwise. Tapping raises a toast (see ToastProvider in @swimbuzz/ui, mounted in
 * app/_layout.tsx) with the full describeZones detail: the record's zone, plus the
 * viewer's zone too when it differs — mirroring web's HoverDetail reveal in
 * ZonedTime.tsx. Always tappable — the zone is relevant info for any time, not just
 * ones in a narrow window.
 */
export function ZonedTimeText({
  startsAt,
  endsAt,
  timeZone,
  style,
}: {
  startsAt: Date | string
  endsAt?: Date | string | null
  timeZone: string
  style?: TextStyle
}) {
  const { showToast } = useToast()
  const range = formatZonedInstantRange(startsAt, endsAt, timeZone)
  const text = `${range.time} ${range.abbrev}`
  return (
    <Pressable
      onPress={() =>
        showToast(formatZoneDescriptionMessage(describeZones(startsAt, endsAt, timeZone)))
      }
      hitSlop={8}
    >
      <Text style={style}>{text}</Text>
    </Pressable>
  )
}
