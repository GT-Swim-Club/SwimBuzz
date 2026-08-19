import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { GlassContainer, GlassView, isLiquidGlassAvailable } from "expo-glass-effect"
import { useFocusEffect, useRouter } from "expo-router"
import type { PracticeSummary } from "@swimbuzz/shared"
import { isStaffRole } from "@swimbuzz/shared"
import {
  Button,
  EmptyState,
  FlatList,
  Screen,
  ScrollView,
  TextField,
  usePalette,
} from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { useThemePreference } from "../../../src/lib/theme"
import { variablesFor } from "../../../src/lib/variables"
import {
  useViewPreferences,
  type DefaultPracticesView,
} from "../../../src/lib/view-preferences"
import { PracticeViewToggle } from "../../../src/components/PracticeViewToggle"
import { PracticeCard } from "../../../src/components/PracticeCard"
import { PracticeTagFilter, type PracticeTag } from "../../../src/components/PracticeTagFilter"
import { Icon } from "../../../src/components/Icon"
import {
  addUtcDays,
  addUtcMonths,
  formatMonthLabel,
  formatWeekLabel,
  groupPracticesByDay,
  monthCells,
  startOfUtcMonth,
  startOfUtcWeek,
  todayUtcKey,
  utcDayKey,
} from "../../../src/lib/practice-calendar"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export default function PracticesScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const { defaultPracticesView, setDefaultPracticesView } = useViewPreferences()
  const c = usePalette()
  const tabBarPad = useTabBarScrollPadding()
  const styles = useMemo(() => makeStyles(c), [c])
  const [view, setView] = useState<DefaultPracticesView | null>(null)
  const activeView = view ?? defaultPracticesView
  const [practices, setPractices] = useState<PracticeSummary[]>([])
  const [query, setQuery] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [catalog, setCatalog] = useState<PracticeTag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState(() => startOfUtcWeek(new Date()))
  const [monthStart, setMonthStart] = useState(() => startOfUtcMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(todayUtcKey)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [data, managed] = await Promise.all([
        api.listPractices(),
        api.listPracticeTags().catch(() => [] as PracticeTag[]),
      ])
      setPractices(data)
      setCatalog(managed)
      setActiveTags((prev) =>
        prev.filter((name) => managed.some((tag) => tag.name === name))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load practices")
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  useEffect(() => {
    const prefix = utcDayKey(monthStart).slice(0, 7)
    if (selectedDay.startsWith(prefix)) return
    const today = todayUtcKey()
    setSelectedDay(today.startsWith(prefix) ? today : utcDayKey(monthStart))
  }, [monthStart, selectedDay])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return practices.filter((practice) => {
      if (
        activeTags.length &&
        !activeTags.some((tag) => (practice.tags ?? []).includes(tag))
      ) {
        return false
      }
      if (!q) return true
      const haystack = [
        practice.title,
        practice.location,
        practice.focus,
        ...(practice.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [practices, query, activeTags])

  const byDay = useMemo(() => groupPracticesByDay(filtered), [filtered])

  const monthGrid = useMemo(() => monthCells(monthStart), [monthStart])
  const monthPractices = useMemo(() => {
    const prefix = utcDayKey(monthStart).slice(0, 7)
    return filtered.filter((practice) => practice.date?.slice(0, 7) === prefix)
  }, [filtered, monthStart])
  const selectedDayPractices = byDay.get(selectedDay) ?? []
  const listPractices = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const da = a.date ?? ""
        const db = b.date ?? ""
        return db.localeCompare(da)
      }),
    [filtered]
  )

  function openPractice(id: string) {
    router.push(`/practices/${id}`)
  }

  function changeView(next: DefaultPracticesView) {
    setView(next)
    void setDefaultPracticesView(next).catch(() => {})
  }

  function goToday() {
    const now = new Date()
    setWeekStart(startOfUtcWeek(now))
    setMonthStart(startOfUtcMonth(now))
    setSelectedDay(todayUtcKey())
  }

  const filters = (
    <>
      {isStaff ? (
        <View style={{ marginBottom: spacing.sm }}>
          <Button
            label="New practice"
            onPress={() => router.push("/practices/new")}
          />
        </View>
      ) : null}
      <TextField
        label="Search"
        placeholder="Search practices"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <View style={styles.filterRow}>
        <PracticeTagFilter
          tags={catalog}
          selected={activeTags}
          canManage={isStaff}
          onChangeTags={setCatalog}
          onChangeSelected={setActiveTags}
        />
        <PracticeViewToggle value={activeView} onChange={changeView} />
      </View>
      {activeView !== "list" ? (
        <PeriodNav
          title={
            activeView === "week"
              ? formatWeekLabel(weekStart)
              : formatMonthLabel(monthStart)
          }
          onPrev={() =>
            activeView === "week"
              ? setWeekStart(addUtcDays(weekStart, -7))
              : setMonthStart(addUtcMonths(monthStart, -1))
          }
          onNext={() =>
            activeView === "week"
              ? setWeekStart(addUtcDays(weekStart, 7))
              : setMonthStart(addUtcMonths(monthStart, 1))
          }
          onToday={goToday}
          isCurrentPeriod={
            activeView === "week"
              ? weekStart.getTime() === startOfUtcWeek(new Date()).getTime()
              : monthStart.getTime() === startOfUtcMonth(new Date()).getTime()
          }
        />
      ) : null}
    </>
  )

  const emptyTitle = error
    ? "Could not load practices"
    : practices.length === 0
      ? "No practices yet"
      : "No matching practices"
  const emptyBody = error ?? undefined

  if (loading && practices.length === 0) {
    return (
      <Screen>
        {filters}
        <View style={{ paddingTop: 40 }}>
          <ActivityIndicator color={c.primaryActive} />
        </View>
      </Screen>
    )
  }

  if (activeView === "list") {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <FlatList
          data={listPractices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: tabBarPad }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
          ListHeaderComponent={<View style={{ marginBottom: spacing.sm }}>{filters}</View>}
          ListEmptyComponent={<EmptyState title={emptyTitle} body={emptyBody} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <PracticeCard
              practice={item}
              showDate
              showDraft={isStaff}
              onPress={() => openPractice(item.id)}
            />
          )}
        />
      </Screen>
    )
  }

  if (activeView === "week") {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabBarPad }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
        >
          {filters}
          <AnimatedWeekDays
            weekStart={weekStart}
            byDay={byDay}
            isStaff={isStaff}
            styles={styles}
            onOpenPractice={openPractice}
          />
        </ScrollView>
      </Screen>
    )
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarPad }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {filters}
        <View style={styles.monthGrid}>
          <View style={styles.weekdayRow}>
            {WEEKDAYS_SHORT.map((label, index) => (
              <Text key={`${label}-${index}`} style={styles.weekday}>
                {label}
              </Text>
            ))}
          </View>
          {chunk(monthGrid, 7).map((row, rowIndex) => (
            <View key={rowIndex} style={styles.monthRow}>
              {row.map(({ date, inMonth }) => {
                const key = utcDayKey(date)
                const count = (byDay.get(key) ?? []).length
                const isToday = key === todayUtcKey()
                const selected = key === selectedDay
                return (
                  <Pressable
                    key={key}
                    onPress={() => setSelectedDay(key)}
                    style={[
                      styles.monthCell,
                      !inMonth && styles.monthCellMuted,
                      isToday && styles.monthCellToday,
                      selected && styles.monthCellSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthDay,
                        !inMonth && styles.monthDayMuted,
                        selected && styles.monthDaySelected,
                      ]}
                    >
                      {date.getUTCDate()}
                    </Text>
                    <View style={styles.dots}>
                      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                        <View
                          key={i}
                          style={[styles.dot, selected && styles.dotSelected]}
                        />
                      ))}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <Text style={styles.selectedHeading}>
            {new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </Text>
          {selectedDayPractices.length === 0 ? (
            <EmptyState title="No practices this day" />
          ) : (
            selectedDayPractices.map((practice) => (
              <PracticeCard
                key={practice.id}
                practice={practice}
                showDraft={isStaff}
                onPress={() => openPractice(practice.id)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

type PracticeStyles = ReturnType<typeof makeStyles>

function daysForWeek(start: Date) {
  return Array.from({ length: 7 }, (_, i) => addUtcDays(start, i))
}

function WeekDaysList({
  weekStart,
  byDay,
  isStaff,
  styles,
  onOpenPractice,
}: {
  weekStart: Date
  byDay: Map<string, PracticeSummary[]>
  isStaff: boolean
  styles: PracticeStyles
  onOpenPractice: (id: string) => void
}) {
  return (
    <View style={styles.weekDays}>
      {daysForWeek(weekStart).map((date) => {
        const key = utcDayKey(date)
        const dayPractices = byDay.get(key) ?? []
        const isToday = key === todayUtcKey()
        return (
          <View key={key} style={[styles.dayBlock, isToday && styles.dayBlockToday]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayLabel, isToday && styles.todayLabel]}>
                {WEEKDAYS[date.getUTCDay()]} {MONTHS_SHORT[date.getUTCMonth()]} {date.getUTCDate()}
              </Text>
              {dayPractices.length === 0 ? (
                <Text style={styles.emptyDay}>No practices</Text>
              ) : null}
            </View>
            {dayPractices.map((practice) => (
              <PracticeCard
                key={practice.id}
                practice={practice}
                showDraft={isStaff}
                onPress={() => onOpenPractice(practice.id)}
              />
            ))}
          </View>
        )
      })}
    </View>
  )
}

function AnimatedWeekDays({
  weekStart,
  byDay,
  isStaff,
  styles,
  onOpenPractice,
}: {
  weekStart: Date
  byDay: Map<string, PracticeSummary[]>
  isStaff: boolean
  styles: PracticeStyles
  onOpenPractice: (id: string) => void
}) {
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
      style={styles.weekViewport}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        if (nextWidth !== width) setWidth(nextWidth)
      }}
    >
      {leavingStart ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.weekSlideLeaving,
            {
              transform: [
                { translateX: Animated.subtract(slide, direction.current * width) },
              ],
            },
          ]}
        >
          <WeekDaysList
            weekStart={leavingStart}
            byDay={byDay}
            isStaff={isStaff}
            styles={styles}
            onOpenPractice={onOpenPractice}
          />
        </Animated.View>
      ) : null}
      <Animated.View style={{ transform: [{ translateX: slide }] }}>
        <WeekDaysList
          weekStart={shownStart}
          byDay={byDay}
          isStaff={isStaff}
          styles={styles}
          onOpenPractice={onOpenPractice}
        />
      </Animated.View>
    </View>
  )
}

function PeriodNav({
  title,
  onPrev,
  onNext,
  onToday,
  isCurrentPeriod,
}: {
  title: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  isCurrentPeriod: boolean
}) {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const gold = variablesFor(colorScheme)["--brand-color-primary"]
  const styles = useMemo(() => makeStyles(c), [c])
  const glass = isLiquidGlassAvailable()
  return (
    <View style={styles.period}>
      <Text numberOfLines={1} style={styles.periodTitle}>
        {title}
      </Text>
      <GlassContainer spacing={8} style={styles.periodNav}>
        <GlassView
          isInteractive
          style={[styles.navBtn, !glass && styles.navBtnFallback]}
        >
          <Pressable
            accessibilityLabel="Previous"
            hitSlop={8}
            onPress={onPrev}
            style={styles.navHit}
          >
            <Icon color={c.text} name="chevronLeft" size={18} />
          </Pressable>
        </GlassView>
        <GlassView
          isInteractive
          style={[styles.todayBtn, !glass && styles.navBtnFallback]}
        >
          <Pressable
            accessibilityLabel="Today"
            hitSlop={8}
            onPress={onToday}
            style={styles.todayHit}
          >
            {({ pressed }) => {
              const highlight = isCurrentPeriod || pressed
              return (
                <>
                  {highlight ? (
                    <View
                      pointerEvents="none"
                      style={[styles.todayRing, { borderColor: gold }]}
                    />
                  ) : null}
                  <Text style={[styles.todayLink, highlight && { color: gold }]}>
                    Today
                  </Text>
                </>
              )
            }}
          </Pressable>
        </GlassView>
        <GlassView
          isInteractive
          style={[styles.navBtn, !glass && styles.navBtnFallback]}
        >
          <Pressable
            accessibilityLabel="Next"
            hitSlop={8}
            onPress={onNext}
            style={styles.navHit}
          >
            <Icon color={c.text} name="chevronRight" size={18} />
          </Pressable>
        </GlassView>
      </GlassContainer>
    </View>
  )
}

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    filterRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    weekViewport: {
      marginTop: spacing.md,
      overflow: "hidden",
    },
    weekDays: {
      gap: spacing.sm,
    },
    weekSlideLeaving: {
      left: 0,
      position: "absolute",
      right: 0,
    },
    dayBlock: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.sm,
    },
    dayBlockToday: {
      borderColor: c.primary,
    },
    dayHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    dayLabel: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: "700",
    },
    todayLabel: { color: c.primaryActive },
    emptyDay: {
      color: c.textTertiary,
      fontSize: 13,
    },
    monthGrid: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      marginTop: spacing.md,
      overflow: "hidden",
    },
    weekdayRow: {
      backgroundColor: c.fillSecondary,
      flexDirection: "row",
    },
    weekday: {
      color: c.textSecondary,
      flex: 1,
      fontSize: 11,
      fontWeight: "700",
      paddingVertical: 8,
      textAlign: "center",
    },
    monthRow: { flexDirection: "row" },
    monthCell: {
      alignItems: "center",
      borderColor: c.border,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderTopWidth: StyleSheet.hairlineWidth,
      flex: 1,
      minHeight: 52,
      paddingVertical: 6,
    },
    monthCellMuted: { backgroundColor: c.fillSecondary },
    monthCellToday: { backgroundColor: c.primaryBg },
    monthCellSelected: {
      backgroundColor: c.primary,
    },
    monthDay: {
      color: c.text,
      fontSize: 13,
      fontWeight: "600",
    },
    monthDayMuted: { color: c.textTertiary },
    monthDaySelected: { color: c.primaryText },
    dots: {
      flexDirection: "row",
      gap: 3,
      marginTop: 4,
      minHeight: 6,
    },
    dot: {
      backgroundColor: c.link,
      borderRadius: 3,
      height: 5,
      width: 5,
    },
    dotSelected: { backgroundColor: c.primaryText },
    selectedHeading: {
      color: c.text,
      fontSize: 16,
      fontWeight: "700",
    },
    period: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between",
      marginTop: spacing.md,
    },
    periodNav: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.xs,
    },
    navBtn: {
      borderRadius: 18,
      height: 36,
      width: 36,
    },
    navHit: {
      alignItems: "center",
      height: 36,
      justifyContent: "center",
      width: 36,
    },
    navBtnFallback: {
      backgroundColor: c.bgContainer,
      borderColor: c.border,
      borderWidth: 1,
    },
    periodTitle: {
      color: c.text,
      flex: 1,
      fontSize: 16,
      fontWeight: "700",
    },
    todayBtn: {
      borderRadius: 18,
      height: 36,
    },
    todayRing: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 18,
      borderWidth: 1,
    },
    todayHit: {
      alignItems: "center",
      height: 36,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
    },
    todayLink: {
      color: c.text,
      fontSize: 13,
      fontWeight: "700",
    },
  })
}
