import { forwardRef } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  formatPracticeDistance,
  formatZonedInstantRange,
  groupPracticeSetsIntoRows,
  isHtmlEmpty,
  type PracticeShareSet,
} from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import { spacing, radii } from "@swimbuzz/tokens"
import { Icon } from "./Icon"
import { FormattedText } from "./FormattedText"

const CAPTURE_WIDTH = 900

/**
 * Off-screen mirror of the practice, rendered at a fixed width for
 * react-native-view-shot to capture as a PNG. Mirrors the web counterpart at
 * apps/web/src/app/practices/[id]/PracticeExportCapture.tsx — a static,
 * shareable snapshot, so it always shows the practice's own time zone rather
 * than whichever zone the exporting device happens to be in.
 */
export const PracticeExportCapture = forwardRef<
  View,
  {
    title: string
    showDraft: boolean
    startsAt: string
    endsAt: string
    timeZone: string
    location: string
    course: string
    focus: string | null
    tags: string[]
    sets: PracticeShareSet[]
    totalDistance: number
  }
>(function PracticeExportCapture(
  { title, showDraft, startsAt, endsAt, timeZone, location, course, focus, tags, sets, totalDistance },
  ref
) {
  const c = usePalette()
  const styles = makeStyles(c)

  const hasFocus = Boolean(focus && !isHtmlEmpty(focus))
  const range = formatZonedInstantRange(startsAt, endsAt, timeZone)

  return (
    <View ref={ref} style={styles.root} collapsable={false}>
      <View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {showDraft ? (
            <View style={styles.draftPill}>
              <Text style={styles.draftPillText}>DRAFT</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.metaRow}>
          <Icon name="calendar" size={17} color={c.textSecondary} />
          <Text style={styles.metaText}>
            {range.date} · {range.time} {range.abbrev}
          </Text>
          {location ? (
            <>
              <View style={styles.metaGap} />
              <Icon name="mapPin" size={17} color={c.textSecondary} />
              <Text style={styles.metaText}>{location}</Text>
            </>
          ) : null}
        </View>
        {tags.length > 0 || totalDistance > 0 ? (
          <View style={styles.metaRow}>
            {totalDistance > 0 ? (
              <>
                <Icon name="waves" size={17} color={c.textSecondary} />
                <Text style={styles.metaText}>{formatPracticeDistance(totalDistance, course)}</Text>
              </>
            ) : null}
            {tags.length > 0 ? (
              <>
                {totalDistance > 0 ? <View style={styles.metaGap} /> : null}
                <Icon name="tag" size={17} color={c.textSecondary} />
                <Text style={styles.metaText}>{tags.join(", ")}</Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      {hasFocus && focus ? (
        <View style={styles.focusBlock}>
          <FormattedText html={focus} style={styles.focusText} />
        </View>
      ) : null}

      <View style={styles.setsBlock}>
        {groupPracticeSetsIntoRows(sets).map((row, rowIndex) => (
          <View key={rowIndex} style={row.length > 1 ? styles.setRowGroup : undefined}>
            {row.map((set, colIndex) => (
              <View key={colIndex} style={[styles.setRow, row.length > 1 && styles.setColumn]}>
                <View style={styles.setHeader}>
                  <Text style={styles.setTitle}>{set.title || "Set"}</Text>
                  {set.distance != null ? (
                    <Text style={styles.setDistance}>{set.distance}</Text>
                  ) : null}
                </View>
                <View style={styles.setBody}>
                  <FormattedText html={set.content} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
})

function makeStyles(c: ReturnType<typeof usePalette>) {
  return StyleSheet.create({
    root: {
      width: CAPTURE_WIDTH,
      gap: spacing.lg,
      padding: spacing.xl,
      backgroundColor: c.bgLayout,
    },
    titleRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: spacing.sm,
    },
    title: {
      fontSize: 38,
      fontWeight: "700",
      color: c.text,
    },
    draftPill: {
      borderRadius: 999,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      backgroundColor: c.primaryBg,
    },
    draftPillText: {
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.5,
      color: c.primaryActive,
    },
    metaRow: {
      marginTop: spacing.xxs,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    metaGap: {
      width: spacing.xxs,
    },
    metaText: {
      fontSize: 17,
      color: c.textSecondary,
    },
    focusBlock: {
      borderRadius: radii.lg,
      borderLeftWidth: 3,
      borderLeftColor: c.primary,
      backgroundColor: c.bgContainer,
      padding: spacing.md,
    },
    focusText: {
      fontSize: 16,
      color: c.text,
    },
    setsBlock: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgContainer,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
    },
    setRow: {
      paddingVertical: spacing.xs,
    },
    setRowGroup: {
      flexDirection: "row",
      gap: spacing.md,
    },
    setColumn: {
      flex: 1,
      minWidth: 0,
    },
    setHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    setTitle: {
      flexShrink: 1,
      fontSize: 16,
      fontWeight: "700",
      color: c.primaryActive,
    },
    setDistance: {
      fontSize: 12,
      fontWeight: "600",
      color: c.primaryActive,
    },
    setBody: {
      marginTop: spacing.xxs,
    },
  })
}
