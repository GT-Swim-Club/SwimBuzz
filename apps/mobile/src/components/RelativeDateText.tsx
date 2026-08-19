import { Pressable, Text, type TextStyle } from "react-native"
import {
  formatClockTime,
  localDayKey,
  relativeEventDayLabel,
  relativeInstantDayLabel,
} from "@swimbuzz/shared"
import { useToast } from "@swimbuzz/ui"

/**
 * Displays a date as "Yesterday"/"Today"/"Tomorrow" when it's within a day of the
 * viewer's current date. Mobile has no hover, so the full absolute value is
 * reached by tapping — the tap raises a toast (see ToastProvider in @swimbuzz/ui,
 * mounted in app/_layout.tsx) rather than nothing happening. When there's nothing
 * to reveal (the date is outside that window), this renders as a plain, untappable
 * Text showing `absolute` — matching the web RelativeDate components' fallback.
 *
 * `kind` picks the day-key math: "event" for a date-only value stored at UTC
 * midnight (practice/meet date), "instant" for a true timestamp (createdAt) — see
 * the UTC-vs-local distinction in packages/shared/src/format.ts.
 */
export function RelativeDateText({
  value,
  kind,
  absolute,
  style,
}: {
  value: Date | string
  kind: "event" | "instant"
  absolute: string
  style?: TextStyle
}) {
  const { showToast } = useToast()
  const todayKey = localDayKey(new Date())
  const relativeDay =
    kind === "event"
      ? relativeEventDayLabel(value, todayKey)
      : relativeInstantDayLabel(value, todayKey)

  if (!relativeDay) return <Text style={style}>{absolute}</Text>

  const instant = value instanceof Date ? value : new Date(value)
  const label = kind === "instant" ? `${relativeDay} at ${formatClockTime(instant)}` : relativeDay

  return (
    <Pressable onPress={() => showToast(absolute)} hitSlop={8}>
      <Text style={style}>{label}</Text>
    </Pressable>
  )
}
