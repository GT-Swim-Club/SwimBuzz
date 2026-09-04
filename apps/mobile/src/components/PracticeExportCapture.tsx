import { forwardRef } from "react"
import { StyleSheet, Text, View } from "react-native"
import {
  formatZonedInstantRange,
  isHtmlEmpty,
  type PracticeShareSet,
} from "@swimbuzz/shared"
import { Chip, usePalette } from "@swimbuzz/ui"
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
    focus: string | null
    tags: string[]
    sets: PracticeShareSet[]
    totalDistance: number
  }
>(function PracticeExportCapture(
  { title, showDraft, startsAt, endsAt, timeZone, location, focus, tags, sets, totalDistance },
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
          <Icon name="calendar" size={16} color={c.textSecondary} />
          <Text style={styles.metaText}>
            {range.date} · {range.time} {range.abbrev}
          </Text>
        </View>
        {location || totalDistance > 0 ? (
          <View style={styles.metaRow}>
            {location ? (
              <>
                <Icon name="mapPin" size={16} color={c.textSecondary} />
                <Text style={styles.metaText}>{location}</Text>
              </>
            ) : null}
            {location && totalDistance > 0 ? <Text style={styles.metaText}>·</Text> : null}
            {totalDistance > 0 ? (
              <Text style={styles.metaText}>{totalDistance} yards</Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {hasFocus || tags.length > 0 ? (
        <View style={styles.focusBlock}>
          {hasFocus && focus ? <FormattedText html={focus} style={styles.focusText} /> : null}
          {tags.length > 0 ? (
            <View style={[styles.tagRow, hasFocus && styles.tagRowSpaced]}>
              {tags.map((tag) => (
                <Chip key={tag} label={tag} selected />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.setsBlock}>
        {sets.map((set, index) => (
          <View key={index} style={styles.setRow}>
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
      fontSize: 34,
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
    metaText: {
      fontSize: 16,
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
    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    tagRowSpaced: {
      marginTop: spacing.sm,
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
