import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { PracticeSummary } from "@swimbuzz/shared"
import { isStaffRole } from "@swimbuzz/shared"
import { EmptyState, Screen, ScrollView, Skeleton, usePalette } from "@swimbuzz/ui"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { api } from "../../../src/lib/api"
import { useAuth } from "../../../src/lib/auth"
import { useTabBarScrollPadding } from "../../../src/lib/tab-bar"
import { usePracticePrefs, type DefaultPracticesView } from "../../../src/lib/view-preferences"
import { PracticeTagFilter, type PracticeTag } from "../../../src/components/PracticeTagFilter"
import { DeletedItemsList } from "../../../src/components/DeletedItemsList"
import {
  PracticesToolbar,
  ToolbarButton,
} from "../../../src/components/practices/PracticesToolbar"
import { PracticeSettingsSheet } from "../../../src/components/practices/PracticeSettingsSheet"
import { MonthPickerSheet } from "../../../src/components/practices/MonthPickerSheet"
import {
  EmptyDayRow,
  PracticeRailRow,
  RailPanel,
  type RowSelection,
} from "../../../src/components/practices/PracticeRail"
import {
  RailHeader,
  WEEKDAY_NAMES,
  WeekRail,
  monthTitle,
  weekDays,
  weekTitle,
} from "../../../src/components/practices/WeekRail"
import {
  PracticeSelectionBar,
  SELECTION_BAR_SPACE,
} from "../../../src/components/practices/PracticeSelectionBar"
import {
  addUtcDays,
  addUtcMonths,
  groupPracticesByDay,
  monthCells,
  practiceDayKey,
  practiceYardage,
  startOfUtcMonth,
  startOfUtcWeek,
  todayUtcKey,
  utcDayKey,
} from "../../../src/lib/practice-calendar"

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const NO_TAGS: PracticeTag[] = []
const NO_PRACTICES: PracticeSummary[] = []

/**
 * The Practices tab, laid out like the web practices sidebar: one toolbar row, then a
 * week rail (or month grid, list, or Trash) of compact practice rows. See PLAN.md.
 */
export default function PracticesScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const isStaff = !!user && isStaffRole(user.role)
  const prefs = usePracticePrefs(isStaff)
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const tabBarPad = useTabBarScrollPadding()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [query, setQuery] = useState("")
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [weekStart, setWeekStart] = useState(() => startOfUtcWeek(new Date()))
  const [monthStart, setMonthStart] = useState(() => startOfUtcMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(todayUtcKey)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [monthPickerOpen, setMonthPickerOpen] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())

  const {
    data: practices = NO_PRACTICES,
    isPending,
    isFetching: practicesFetching,
    error,
    refetch: refetchPractices,
  } = useQuery({ queryKey: ["practices"], queryFn: () => api.listPractices() })

  const { data: catalog = NO_TAGS, refetch: refetchCatalog } = useQuery({
    queryKey: ["practice-tags"],
    queryFn: () => api.listPracticeTags(),
  })

  const load = () => {
    void refetchPractices()
    void refetchCatalog()
  }

  // Drop any selected tag that no longer exists in the catalog. Keep the same array
  // when nothing is dropped, so this never re-renders on its own.
  useEffect(() => {
    setActiveTags((prev) => {
      const next = prev.filter((name) => catalog.some((tag) => tag.name === name))
      return next.length === prev.length ? prev : next
    })
  }, [catalog])

  function setCatalog(next: PracticeTag[]) {
    queryClient.setQueryData(["practice-tags"], next)
  }

  // Keep the month view's selected day inside the shown month.
  useEffect(() => {
    const prefix = utcDayKey(monthStart).slice(0, 7)
    if (selectedDay.startsWith(prefix)) return
    const today = todayUtcKey()
    setSelectedDay(today.startsWith(prefix) ? today : utcDayKey(monthStart))
  }, [monthStart, selectedDay])

  // Like web: a search shows matches as a list, and clearing it restores the view
  // that was showing before. Week and month can't show arbitrary matches.
  const preSearchViewRef = useRef<DefaultPracticesView | null>(null)
  function handleQueryChange(value: string) {
    setQuery(value)
    if (value.trim()) {
      if (preSearchViewRef.current === null) preSearchViewRef.current = prefs.view
      if (prefs.view === "week" || prefs.view === "month") prefs.setView("list")
    } else if (preSearchViewRef.current !== null) {
      prefs.setView(preSearchViewRef.current)
      preSearchViewRef.current = null
    }
  }

  const exitSelecting = useCallback(() => {
    setSelecting(false)
    setSelectedIds(new Set())
  }, [])

  // Trash has no select mode (same as web).
  useEffect(() => {
    if (prefs.view === "deleted") exitSelecting()
  }, [prefs.view, exitSelecting])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return practices.filter((practice) => {
      if (prefs.scope !== "all" && (prefs.scope === "mine") !== (practice.visibility === "PRIVATE")) {
        return false
      }
      if (activeTags.length && !activeTags.some((tag) => (practice.tags ?? []).includes(tag))) {
        return false
      }
      if (!q) return true
      const haystack = [practice.title, practice.location, practice.focus, ...(practice.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [practices, query, activeTags, prefs.scope])

  const byDay = useMemo(() => {
    const map = groupPracticesByDay(filtered)
    for (const list of map.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    return map
  }, [filtered])

  const listPractices = useMemo(() => {
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      switch (prefs.sort) {
        case "date-asc":
          return a.startsAt.localeCompare(b.startsAt)
        case "yards-desc":
          return practiceYardage(b) - practiceYardage(a) || b.startsAt.localeCompare(a.startsAt)
        case "yards-asc":
          return practiceYardage(a) - practiceYardage(b) || b.startsAt.localeCompare(a.startsAt)
        default:
          return b.startsAt.localeCompare(a.startsAt)
      }
    })
    return sorted
  }, [filtered, prefs.sort])

  const selectedDayPractices = byDay.get(selectedDay) ?? NO_PRACTICES

  // "Select all" covers what the current view shows: the list, the week's rows
  // (minus Fri–Sun with Mon–Thu on), or the month view's selected day.
  const visibleIds = useMemo(() => {
    if (prefs.view === "list") return listPractices.map((p) => p.id)
    if (prefs.view === "month") return selectedDayPractices.map((p) => p.id)
    return weekDays(weekStart, prefs.monThuOnly).flatMap((date) =>
      (byDay.get(utcDayKey(date)) ?? []).map((p) => p.id)
    )
  }, [prefs.view, prefs.monThuOnly, listPractices, selectedDayPractices, byDay, weekStart])

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  // Resolved against the live list, so practices deleted elsewhere drop out on their
  // own. Oldest first, matching the exported PDF's order.
  const selectedPractices = useMemo(
    () =>
      practices
        .filter((p) => selectedIds.has(p.id))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [practices, selectedIds]
  )

  const selectionFor = useCallback(
    (id: string): RowSelection =>
      selecting
        ? {
            checked: selectedIds.has(id),
            onToggle: () =>
              setSelectedIds((prev) => {
                const next = new Set(prev)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              }),
          }
        : null,
    [selecting, selectedIds]
  )

  function handleDeleted({ deletedIds, skipped }: { deletedIds: string[]; skipped: Array<{ id: string }> }) {
    // Practices that couldn't be moved (being edited) stay selected so they can be retried.
    if (skipped.length === 0) exitSelecting()
    else setSelectedIds(new Set(skipped.map((item) => item.id)))
    if (deletedIds.length > 0) {
      void queryClient.invalidateQueries({ queryKey: ["practices"] })
      void queryClient.invalidateQueries({ queryKey: ["recently-deleted"] })
    }
  }

  function openPractice(id: string) {
    router.push(`/practices/${id}`)
  }

  function goToday() {
    const now = new Date()
    setWeekStart(startOfUtcWeek(now))
    setMonthStart(startOfUtcMonth(now))
    setSelectedDay(todayUtcKey())
  }

  const rowProps = {
    activeTags,
    cardLabel: prefs.cardLabel,
    showDraft: isStaff,
    selectionFor,
    onOpenPractice: openPractice,
  }

  const toolbar = (
    <PracticesToolbar
      query={query}
      onQueryChange={handleQueryChange}
      showSelect={prefs.view !== "deleted"}
      selecting={selecting}
      onSelectingChange={(next) => (next ? setSelecting(true) : exitSelecting())}
      tagsButton={
        <PracticeTagFilter
          tags={catalog}
          selected={activeTags}
          canManage={isStaff}
          onChangeTags={setCatalog}
          onChangeSelected={setActiveTags}
          renderTrigger={(open) => (
            <ToolbarButton
              icon="tag"
              label={
                activeTags.length ? `Filter by tags, ${activeTags.join(", ")}` : "Filter by tags"
              }
              active={activeTags.length > 0}
              onPress={open}
            />
          )}
        />
      }
      onOpenSettings={() => setSettingsOpen(true)}
      newLabel={isStaff ? "New practice" : "New private practice"}
      onNew={() => router.push("/practices/new")}
    />
  )

  const sheets = (
    <>
      <PracticeSettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={prefs}
        isStaff={isStaff}
      />
      <MonthPickerSheet
        visible={monthPickerOpen}
        onClose={() => setMonthPickerOpen(false)}
        weekStart={weekStart}
        byDay={byDay}
        onPickDay={(date) => setWeekStart(startOfUtcWeek(date))}
      />
    </>
  )

  if (prefs.view === "deleted") {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <View style={styles.toolbarWrap}>{toolbar}</View>
        <DeletedItemsList
          kind="practice"
          tabBarPad={tabBarPad}
          query={query}
          sort={prefs.sort === "date-asc" ? "date-asc" : "date-desc"}
        />
        {sheets}
      </Screen>
    )
  }

  if (isPending) {
    return (
      <Screen style={{ paddingBottom: 0 }}>
        <PracticesSkeleton styles={styles} />
      </Screen>
    )
  }

  const emptyListMessage = error
    ? "Could not load practices."
    : query || activeTags.length
      ? "No practices match your search."
      : prefs.scope === "mine"
        ? "No private practices yet. Create one to get started."
        : isStaff
          ? "No practices yet. Create one to get started."
          : "No practices posted yet."

  const bottomPad = tabBarPad + (selecting ? SELECTION_BAR_SPACE : 0)

  let body: ReactNode
  if (prefs.view === "list") {
    body =
      listPractices.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyPanelText}>{emptyListMessage}</Text>
        </View>
      ) : (
        <RailPanel>
          {listPractices.map((practice) => {
            const [, month, day] = practiceDayKey(practice).split("-").map(Number)
            return (
              <PracticeRailRow
                key={practice.id}
                practice={practice}
                dateTop={MONTHS_SHORT[month - 1] ?? ""}
                dateNumber={day}
                isToday={false}
                activeTags={activeTags}
                cardLabel={prefs.cardLabel}
                showDraft={isStaff}
                selection={selectionFor(practice.id)}
                onOpen={() => openPractice(practice.id)}
              />
            )
          })}
        </RailPanel>
      )
  } else if (prefs.view === "week") {
    body = (
      <>
        <RailHeader
          title={weekTitle(weekStart)}
          onTitlePress={() => setMonthPickerOpen(true)}
          onPrev={() => setWeekStart(addUtcDays(weekStart, -7))}
          onNext={() => setWeekStart(addUtcDays(weekStart, 7))}
          onToday={goToday}
          isCurrent={weekStart.getTime() === startOfUtcWeek(new Date()).getTime()}
          prevLabel="Previous week"
          nextLabel="Next week"
        />
        {error ? <EmptyState title="Could not load practices" body={error.message} /> : null}
        <WeekRail weekStart={weekStart} byDay={byDay} monThuOnly={prefs.monThuOnly} {...rowProps} />
      </>
    )
  } else {
    const today = todayUtcKey()
    const pickedDate = new Date(`${selectedDay}T00:00:00Z`)
    body = (
      <>
        <RailHeader
          title={monthTitle(monthStart)}
          onPrev={() => setMonthStart(addUtcMonths(monthStart, -1))}
          onNext={() => setMonthStart(addUtcMonths(monthStart, 1))}
          onToday={goToday}
          isCurrent={monthStart.getTime() === startOfUtcMonth(new Date()).getTime()}
          prevLabel="Previous month"
          nextLabel="Next month"
        />
        {error ? <EmptyState title="Could not load practices" body={error.message} /> : null}
        <View style={styles.monthGrid}>
          {WEEKDAY_LETTERS.map((letter, index) => (
            <Text key={index} style={styles.monthWeekday}>
              {letter}
            </Text>
          ))}
          {monthCells(monthStart).map(({ date, inMonth }) => {
            const key = utcDayKey(date)
            const count = (byDay.get(key) ?? []).length
            const isToday = key === today
            const picked = key === selectedDay
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: picked }}
                accessibilityLabel={`${date.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  timeZone: "UTC",
                })}${count ? `, ${count} practice${count === 1 ? "" : "s"}` : ""}`}
                onPress={() => setSelectedDay(key)}
                style={({ pressed }) => [
                  styles.monthCell,
                  picked && styles.monthCellPicked,
                  pressed && !picked && styles.pressed,
                ]}
              >
                <View style={[styles.monthDayCircle, isToday && styles.monthDayCircleToday]}>
                  <Text
                    style={[
                      styles.monthDay,
                      !inMonth && styles.monthDayMuted,
                      isToday && styles.monthDayToday,
                    ]}
                  >
                    {date.getUTCDate()}
                  </Text>
                </View>
                <View style={[styles.monthDot, count === 0 && styles.monthDotHidden]} />
              </Pressable>
            )
          })}
        </View>
        <RailPanel>
          {selectedDayPractices.length === 0 ? (
            <EmptyDayRow
              weekday={WEEKDAY_NAMES[pickedDate.getUTCDay()]}
              dateNumber={pickedDate.getUTCDate()}
              isToday={selectedDay === today}
            />
          ) : (
            selectedDayPractices.map((practice) => (
              <PracticeRailRow
                key={practice.id}
                practice={practice}
                dateTop={WEEKDAY_NAMES[pickedDate.getUTCDay()]}
                dateNumber={pickedDate.getUTCDate()}
                isToday={selectedDay === today}
                activeTags={activeTags}
                cardLabel={prefs.cardLabel}
                showDraft={isStaff}
                selection={selectionFor(practice.id)}
                onOpen={() => openPractice(practice.id)}
              />
            ))
          )}
        </RailPanel>
      </>
    )
  }

  return (
    <Screen style={{ paddingBottom: 0 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={practicesFetching} onRefresh={load} />}
      >
        <View style={styles.toolbarWrap}>{toolbar}</View>
        {body}
      </ScrollView>
      {selecting ? (
        <PracticeSelectionBar
          selected={selectedPractices}
          canDelete={
            isStaff ||
            (selectedPractices.length > 0 && selectedPractices.every((p) => p.visibility === "PRIVATE"))
          }
          allVisibleSelected={allVisibleSelected}
          canSelectAll={visibleIds.length > 0}
          bottomInset={insets.bottom}
          onToggleAll={toggleAllVisible}
          onCancel={exitSelecting}
          onExported={exitSelecting}
          onDeleted={handleDeleted}
        />
      ) : null}
      {sheets}
    </Screen>
  )
}

type PracticeStyles = ReturnType<typeof makeStyles>

/** Mirrors the loaded layout — toolbar row, week header, and a rail of seven rows. */
function PracticesSkeleton({ styles }: { styles: PracticeStyles }) {
  return (
    <View accessibilityLabel="Loading practices">
      <View style={[styles.toolbarWrap, styles.skeletonToolbar]}>
        <Skeleton style={styles.skeletonButton} />
        <Skeleton style={styles.skeletonButton} />
        <View style={styles.skeletonToolbarRight}>
          <Skeleton style={styles.skeletonButton} />
          <Skeleton style={styles.skeletonButton} />
          <Skeleton style={styles.skeletonButton} />
        </View>
      </View>
      <View style={styles.skeletonHeader}>
        <Skeleton style={{ height: 22, width: 150 }} />
        <Skeleton style={{ height: 32, width: 124, borderRadius: radii.md }} />
      </View>
      <RailPanel>
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={styles.skeletonRow}>
            <View style={styles.skeletonDate}>
              <Skeleton style={{ height: 10, width: 24 }} />
              <Skeleton style={{ height: 16, width: 18 }} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton style={{ height: 14, width: i % 2 ? "55%" : "70%" }} />
              <Skeleton style={{ height: 11, width: "40%" }} />
            </View>
          </View>
        ))}
      </RailPanel>
    </View>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    toolbarWrap: { marginBottom: spacing.sm },
    pressed: { backgroundColor: c.bgHover },
    emptyPanel: {
      alignItems: "center",
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xl,
    },
    emptyPanelText: { color: c.textSecondary, fontSize: 14, textAlign: "center" },
    monthGrid: {
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      marginBottom: spacing.sm,
      padding: spacing.xs,
    },
    monthWeekday: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: "600",
      paddingBottom: spacing.xxs,
      textAlign: "center",
      width: `${100 / 7}%`,
    },
    monthCell: {
      alignItems: "center",
      borderRadius: radii.md,
      paddingVertical: 4,
      width: `${100 / 7}%`,
    },
    monthCellPicked: { backgroundColor: c.primaryBg },
    monthDayCircle: {
      alignItems: "center",
      borderRadius: 14,
      height: 28,
      justifyContent: "center",
      minWidth: 28,
    },
    monthDayCircleToday: { backgroundColor: c.primary },
    monthDay: { color: c.text, fontSize: 15, fontVariant: ["tabular-nums"], fontWeight: "500" },
    monthDayMuted: { color: c.textQuaternary },
    monthDayToday: { color: c.primaryContrast, fontWeight: "700" },
    monthDot: { backgroundColor: c.primary, borderRadius: 2, height: 4, marginTop: 2, width: 4 },
    monthDotHidden: { opacity: 0 },
    skeletonToolbar: { alignItems: "center", flexDirection: "row", gap: spacing.xs },
    skeletonToolbarRight: { flexDirection: "row", gap: spacing.xs, marginLeft: "auto" },
    skeletonButton: { borderRadius: radii.md, height: 40, width: 40 },
    skeletonHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    skeletonRow: {
      alignItems: "center",
      borderColor: c.borderSecondary,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 60,
      paddingHorizontal: spacing.sm,
    },
    skeletonDate: { alignItems: "center", gap: 4, width: 40 },
  })
}
