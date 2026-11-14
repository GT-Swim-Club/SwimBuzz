import { useEffect, useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import type { PracticeSummary } from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { BottomSheet, usePalette } from "@swimbuzz/ui"
import {
  addUtcDays,
  addUtcMonths,
  monthCells,
  startOfUtcMonth,
  todayUtcKey,
  utcDayKey,
} from "../../lib/practice-calendar"
import { Icon } from "../Icon"
import { monthTitle } from "./WeekRail"

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"]

/**
 * Jump to a week, like the web week rail's month popover: browse months, see which
 * days have practices, and tap a day to show its week. The shown week is outlined.
 */
export function MonthPickerSheet({
  visible,
  onClose,
  weekStart,
  byDay,
  onPickDay,
}: {
  visible: boolean
  onClose: () => void
  weekStart: Date
  byDay: Map<string, PracticeSummary[]>
  onPickDay: (date: Date) => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const [month, setMonth] = useState(() => startOfUtcMonth(weekStart))

  // Each time the sheet opens, start from the month of the week being shown.
  useEffect(() => {
    if (visible) setMonth(startOfUtcMonth(weekStart))
  }, [visible, weekStart])

  const cells = useMemo(() => monthCells(month), [month])
  const weekKeys = useMemo(
    () => new Set(Array.from({ length: 7 }, (_, i) => utcDayKey(addUtcDays(weekStart, i)))),
    [weekStart]
  )
  const today = todayUtcKey()
  const title = monthTitle(month)

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={6}
          onPress={() => setMonth(addUtcMonths(month, -1))}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Icon name="chevronLeft" size={16} color={c.textSecondary} />
        </Pressable>
        <Text style={styles.title}>
          <Text style={styles.titlePrimary}>{title.primary}</Text>{" "}
          <Text style={styles.titleSecondary}>{title.secondary}</Text>
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={6}
          onPress={() => setMonth(addUtcMonths(month, 1))}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Icon name="chevronRight" size={16} color={c.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          <Text key={index} style={styles.weekday}>
            {letter}
          </Text>
        ))}
        {cells.map(({ date, inMonth }) => {
          const key = utcDayKey(date)
          const count = (byDay.get(key) ?? []).length
          const isToday = key === today
          const inShownWeek = weekKeys.has(key)
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${date.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}${count ? `, ${count} practice${count === 1 ? "" : "s"}` : ""}`}
              onPress={() => {
                onPickDay(date)
                onClose()
              }}
              style={({ pressed }) => [
                styles.cell,
                inShownWeek && styles.cellShownWeek,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.dayCircle, isToday && styles.dayCircleToday]}>
                <Text
                  style={[
                    styles.day,
                    !inMonth && styles.dayMuted,
                    isToday && styles.dayToday,
                  ]}
                >
                  {date.getUTCDate()}
                </Text>
              </View>
              <View style={[styles.dot, count === 0 && styles.dotHidden]} />
            </Pressable>
          )
        })}
      </View>
    </BottomSheet>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
      marginTop: spacing.xs,
    },
    title: { fontSize: 17 },
    titlePrimary: { color: c.text, fontWeight: "700" },
    titleSecondary: { color: c.textSecondary, fontWeight: "400" },
    navButton: {
      alignItems: "center",
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: radii.md,
      borderWidth: 1,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    pressed: { backgroundColor: c.bgHover },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    weekday: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: "600",
      paddingBottom: spacing.xxs,
      textAlign: "center",
      width: `${100 / 7}%`,
    },
    cell: {
      alignItems: "center",
      borderRadius: radii.md,
      paddingVertical: 4,
      width: `${100 / 7}%`,
    },
    cellShownWeek: { backgroundColor: c.primaryBg },
    dayCircle: {
      alignItems: "center",
      borderRadius: 14,
      height: 28,
      justifyContent: "center",
      minWidth: 28,
    },
    dayCircleToday: { backgroundColor: c.primary },
    day: { color: c.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "500" },
    dayMuted: { color: c.textQuaternary },
    dayToday: { color: c.primaryContrast, fontWeight: "700" },
    dot: { backgroundColor: c.primary, borderRadius: 2, height: 4, marginTop: 2, width: 4 },
    dotHidden: { opacity: 0 },
  })
}
