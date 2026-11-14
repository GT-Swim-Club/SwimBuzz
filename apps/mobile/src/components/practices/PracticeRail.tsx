import { useMemo, type ReactNode } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import {
  formatPracticeDistance,
  formatZonedInstantRange,
  type PracticeSummary,
} from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"
import type { PracticeCardLabel } from "../../lib/view-preferences"
import { practiceYardage } from "../../lib/practice-calendar"
import { Icon } from "../Icon"

/**
 * The practice rails of the Practices tab, mirroring the web sidebar's WeekRail and
 * PracticeListRail: one bordered panel of compact rows, each with a date column, the
 * title over its time (or tags), and a Private/Draft badge and distance on the right.
 */

/** Like web's showCardTags: tags replace the time when filtering by tag or when the card label is Tags. */
export function showCardTags(
  activeTags: string[],
  practiceTags: string[],
  cardLabel: PracticeCardLabel
) {
  return (activeTags.length > 0 || cardLabel === "tags") && practiceTags.length > 0
}

export type RowSelection = { checked: boolean; onToggle: () => void } | null

export function RailPanel({ children }: { children: ReactNode }) {
  const styles = useRailStyles()
  return <View style={styles.panel}>{children}</View>
}

/** Weekday (or month) in small caps over the date number; today's number sits in a gold circle. */
export function DateColumn({
  top,
  dateNumber,
  isToday,
  dimmed,
}: {
  top: string
  dateNumber: number
  isToday: boolean
  dimmed?: boolean
}) {
  const styles = useRailStyles()
  return (
    <View style={styles.dateColumn}>
      <Text style={styles.dateTop}>{top}</Text>
      {isToday ? (
        <View style={styles.todayCircle}>
          <Text style={styles.todayNumber}>{dateNumber}</Text>
        </View>
      ) : (
        <Text style={[styles.dateNumber, dimmed && styles.dateNumberDimmed]}>{dateNumber}</Text>
      )}
    </View>
  )
}

export function EmptyDayRow({
  weekday,
  dateNumber,
  isToday,
}: {
  weekday: string
  dateNumber: number
  isToday: boolean
}) {
  const styles = useRailStyles()
  return (
    <View
      accessible
      accessibilityLabel={`${weekday} ${dateNumber}, no practice posted`}
      style={[styles.row, styles.emptyRow]}
    >
      <DateColumn top={weekday} dateNumber={dateNumber} isToday={isToday} dimmed />
      <Text numberOfLines={1} style={styles.emptyText}>
        No practice posted
      </Text>
    </View>
  )
}

export function PracticeRailRow({
  practice,
  dateTop,
  dateNumber,
  isToday,
  activeTags,
  cardLabel,
  showDraft,
  selection,
  onOpen,
}: {
  practice: PracticeSummary
  /** Weekday in the week rail, month in the list rail. */
  dateTop: string
  dateNumber: number
  isToday: boolean
  activeTags: string[]
  cardLabel: PracticeCardLabel
  showDraft: boolean
  selection: RowSelection
  onOpen: () => void
}) {
  const c = usePalette()
  const styles = useRailStyles()
  const tags = practice.tags ?? []
  const yards = practiceYardage(practice)
  const range = formatZonedInstantRange(practice.startsAt, practice.endsAt, practice.timeZone)
  const subtitle = showCardTags(activeTags, tags, cardLabel)
    ? tags.join(", ")
    : `${range.time} ${range.abbrev}`
  const isPrivate = practice.visibility === "PRIVATE"
  const checked = selection?.checked ?? false

  return (
    <Pressable
      accessibilityRole={selection ? "checkbox" : "button"}
      accessibilityState={selection ? { checked } : undefined}
      accessibilityLabel={`${practice.title}, ${subtitle}`}
      onPress={selection ? selection.onToggle : onOpen}
      style={({ pressed }) => [
        styles.row,
        checked && styles.rowChecked,
        pressed && !checked && styles.rowPressed,
      ]}
    >
      {selection ? (
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Icon name="check" size={14} strokeWidth={3} color={c.primaryContrast} /> : null}
        </View>
      ) : null}
      <DateColumn top={dateTop} dateNumber={dateNumber} isToday={isToday} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>
          {practice.title}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.trailing}>
        {isPrivate ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Private</Text>
          </View>
        ) : showDraft && !practice.published ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Draft</Text>
          </View>
        ) : null}
        {yards > 0 ? (
          <Text style={styles.distance}>{formatPracticeDistance(yards, practice.course)}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function useRailStyles() {
  const c = usePalette()
  return useMemo(() => makeStyles(c), [c])
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    panel: {
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: 12,
      borderWidth: 1,
      gap: spacing.xs,
      padding: spacing.xs,
    },
    row: {
      alignItems: "center",
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 60,
      paddingHorizontal: spacing.sm,
      paddingVertical: 10,
    },
    rowPressed: { backgroundColor: c.bgHover },
    rowChecked: { backgroundColor: c.primaryBg, borderColor: c.primary },
    emptyRow: { opacity: 0.5 },
    emptyText: { color: c.textTertiary, flex: 1, fontSize: 14 },
    checkbox: {
      alignItems: "center",
      backgroundColor: c.bgContainer,
      borderColor: c.borderSecondary,
      borderRadius: radii.xs,
      borderWidth: 1,
      height: 20,
      justifyContent: "center",
      width: 20,
    },
    checkboxChecked: { backgroundColor: c.primary, borderColor: c.primary },
    dateColumn: { alignItems: "center", width: 40 },
    dateTop: {
      color: c.textTertiary,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    dateNumber: {
      color: c.text,
      fontSize: 17,
      fontVariant: ["tabular-nums"],
      fontWeight: "600",
    },
    dateNumberDimmed: { color: c.textTertiary },
    todayCircle: {
      alignItems: "center",
      backgroundColor: c.primary,
      borderRadius: 12,
      height: 24,
      justifyContent: "center",
      marginTop: 1,
      minWidth: 24,
      paddingHorizontal: 6,
    },
    todayNumber: {
      color: c.primaryContrast,
      fontSize: 13,
      fontVariant: ["tabular-nums"],
      fontWeight: "700",
    },
    body: { flex: 1, minWidth: 0 },
    title: { color: c.text, fontSize: 15, fontWeight: "600" },
    subtitle: { color: c.textTertiary, fontSize: 13, marginTop: 2 },
    trailing: { alignItems: "flex-end", flexShrink: 0, gap: 4 },
    badge: {
      backgroundColor: c.primaryBg,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    badgeText: {
      color: c.accent,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    distance: {
      color: c.textTertiary,
      fontSize: 12,
      fontVariant: ["tabular-nums"],
    },
  })
}
