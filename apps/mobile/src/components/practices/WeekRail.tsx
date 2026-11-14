import { useEffect, useMemo, useRef, useState } from "react"
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native"
import type { PracticeSummary } from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"
import type { PracticeCardLabel } from "../../lib/view-preferences"
import { addUtcDays, todayUtcKey, utcDayKey } from "../../lib/practice-calendar"
import { Icon } from "../Icon"
import { EmptyDayRow, PracticeRailRow, RailPanel, type RowSelection } from "./PracticeRail"

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Like web's weekTitle: "November 2026", or "Nov – Dec 2026" for a week spanning two months. */
export function weekTitle(weekStart: Date) {
  const weekEnd = addUtcDays(weekStart, 6)
  const startMonth = weekStart.getUTCMonth()
  const endMonth = weekEnd.getUTCMonth()
  if (startMonth === endMonth) {
    return { primary: MONTH_NAMES[startMonth], secondary: String(weekStart.getUTCFullYear()) }
  }
  return {
    primary: `${MONTH_SHORT_NAMES[startMonth]} – ${MONTH_SHORT_NAMES[endMonth]}`,
    secondary: String(weekEnd.getUTCFullYear()),
  }
}

export function monthTitle(monthStart: Date) {
  return { primary: MONTH_NAMES[monthStart.getUTCMonth()], secondary: String(monthStart.getUTCFullYear()) }
}

/** Days shown in the week rail: all seven, or Mon–Thu only. */
export function weekDays(weekStart: Date, monThuOnly: boolean) {
  return Array.from({ length: 7 }, (_, i) => addUtcDays(weekStart, i)).filter(
    (date) => !monThuOnly || (date.getUTCDay() >= 1 && date.getUTCDay() <= 4)
  )
}

/** "November 2026 ▾" (opens the month picker) with ‹ Today › — web's week rail header. */
export function RailHeader({
  title,
  onTitlePress,
  onPrev,
  onNext,
  onToday,
  isCurrent,
  prevLabel,
  nextLabel,
}: {
  title: { primary: string; secondary: string }
  onTitlePress?: () => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  isCurrent: boolean
  prevLabel: string
  nextLabel: string
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const heading = (
    <Text numberOfLines={1} style={styles.title}>
      <Text style={styles.titlePrimary}>{title.primary}</Text>{" "}
      <Text style={styles.titleSecondary}>{title.secondary}</Text>
    </Text>
  )
  return (
    <View style={styles.header}>
      {onTitlePress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title.primary} ${title.secondary}, change month`}
          onPress={onTitlePress}
          style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}
        >
          {heading}
          <Icon name="chevronDown" size={16} color={c.textSecondary} />
        </Pressable>
      ) : (
        <View style={styles.titleButton}>{heading}</View>
      )}
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={prevLabel}
          hitSlop={6}
          onPress={onPrev}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Icon name="chevronLeft" size={16} color={c.textSecondary} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Today"
          hitSlop={6}
          onPress={onToday}
          style={({ pressed }) => [
            styles.todayButton,
            isCurrent && styles.todayCurrent,
            pressed && !isCurrent && styles.pressed,
          ]}
        >
          <Text style={[styles.todayText, isCurrent && styles.todayTextCurrent]}>Today</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          hitSlop={6}
          onPress={onNext}
          style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
        >
          <Icon name="chevronRight" size={16} color={c.textSecondary} />
        </Pressable>
      </View>
    </View>
  )
}

type RailRowProps = {
  byDay: Map<string, PracticeSummary[]>
  monThuOnly: boolean
  activeTags: string[]
  cardLabel: PracticeCardLabel
  showDraft: boolean
  selectionFor: (id: string) => RowSelection
  onOpenPractice: (id: string) => void
}

function WeekRows({ weekStart, ...props }: RailRowProps & { weekStart: Date }) {
  const today = todayUtcKey()
  return (
    <RailPanel>
      {weekDays(weekStart, props.monThuOnly).map((date) => {
        const key = utcDayKey(date)
        const dayPractices = props.byDay.get(key) ?? []
        const weekday = WEEKDAY_NAMES[date.getUTCDay()]
        const isToday = key === today
        if (dayPractices.length === 0) {
          return (
            <EmptyDayRow key={key} weekday={weekday} dateNumber={date.getUTCDate()} isToday={isToday} />
          )
        }
        return dayPractices.map((practice) => (
          <PracticeRailRow
            key={practice.id}
            practice={practice}
            dateTop={weekday}
            dateNumber={date.getUTCDate()}
            isToday={isToday}
            activeTags={props.activeTags}
            cardLabel={props.cardLabel}
            showDraft={props.showDraft}
            selection={props.selectionFor(practice.id)}
            onOpen={() => props.onOpenPractice(practice.id)}
          />
        ))
      })}
    </RailPanel>
  )
}

/** The week's rows, sliding in from the side when the week changes. */
export function WeekRail({ weekStart, ...props }: RailRowProps & { weekStart: Date }) {
  const [width, setWidth] = useState(0)
  const [shownStart, setShownStart] = useState(weekStart)
  const [leavingStart, setLeavingStart] = useState<Date | null>(null)
  const slide = useRef(new Animated.Value(0)).current
  const direction = useRef(1)
  const shownRef = useRef(weekStart)

  useEffect(() => {
    const from = shownRef.current
    if (from.getTime() === weekStart.getTime()) return

    const dir = weekStart.getTime() > from.getTime() ? 1 : -1
    direction.current = dir
    shownRef.current = weekStart
    setLeavingStart(from)
    setShownStart(weekStart)

    if (width === 0) {
      slide.setValue(0)
      setLeavingStart(null)
      return
    }

    slide.stopAnimation()
    slide.setValue(dir * width)
    Animated.timing(slide, {
      toValue: 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setLeavingStart(null)
    })
  }, [slide, weekStart, width])

  return (
    <View
      style={railStyles.viewport}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        if (nextWidth !== width) setWidth(nextWidth)
      }}
    >
      {leavingStart ? (
        <Animated.View
          pointerEvents="none"
          style={[
            railStyles.leaving,
            { transform: [{ translateX: Animated.subtract(slide, direction.current * width) }] },
          ]}
        >
          <WeekRows weekStart={leavingStart} {...props} />
        </Animated.View>
      ) : null}
      <Animated.View style={{ transform: [{ translateX: slide }] }}>
        <WeekRows weekStart={shownStart} {...props} />
      </Animated.View>
    </View>
  )
}

const railStyles = StyleSheet.create({
  viewport: { overflow: "hidden" },
  leaving: { left: 0, position: "absolute", right: 0 },
})

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    header: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    titleButton: {
      alignItems: "center",
      borderRadius: radii.md,
      flexDirection: "row",
      flexShrink: 1,
      gap: 2,
      marginHorizontal: -spacing.xs,
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
    },
    title: { flexShrink: 1, fontSize: 19 },
    titlePrimary: { color: c.text, fontWeight: "700" },
    titleSecondary: { color: c.textSecondary, fontWeight: "400" },
    nav: { alignItems: "center", flexDirection: "row", gap: 6 },
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
    todayButton: {
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: radii.md,
      borderWidth: 1,
      height: 32,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    todayCurrent: { backgroundColor: c.primaryBg, borderColor: c.primary },
    todayText: { color: c.textSecondary, fontSize: 13, fontWeight: "600" },
    todayTextCurrent: { color: c.accent },
    pressed: { backgroundColor: c.bgHover },
  })
}
