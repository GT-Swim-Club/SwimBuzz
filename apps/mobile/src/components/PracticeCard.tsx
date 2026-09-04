import { Pressable, StyleSheet, Text, View } from "react-native"
import type { PracticeSummary } from "@swimbuzz/shared"
import { formatFullDate } from "@swimbuzz/shared"
import { radii, spacing, type ColorPalette } from "@swimbuzz/tokens"
import { usePalette } from "@swimbuzz/ui"
import { useMemo } from "react"
import { Icon } from "./Icon"
import { RelativeDateText } from "./RelativeDateText"
import { ZonedTimeText } from "./ZonedTimeText"
import { practiceYardage } from "../lib/practice-calendar"

export function PracticeCard({
  practice,
  showDate = false,
  showDraft = false,
  compact = false,
  onPress,
}: {
  practice: PracticeSummary
  showDate?: boolean
  showDraft?: boolean
  compact?: boolean
  onPress: () => void
}) {
  const c = usePalette()
  const styles = useMemo(() => makeStyles(c), [c])
  const yards = practiceYardage(practice)
  const tags = practice.tags ?? []

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.titleRow}>
        <Text numberOfLines={2} style={styles.title}>
          {practice.title}
        </Text>
        {showDraft && !practice.published ? (
          <View style={styles.draft}>
            <Text style={styles.draftText}>Draft</Text>
          </View>
        ) : null}
      </View>
      {yards > 0 ? (
        <Text style={styles.yards}>{yards} yards</Text>
      ) : null}
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.meta}>
        {showDate ? (
          <View style={styles.metaRow}>
            <Icon color={c.textTertiary} name="calendar" size={14} />
            <RelativeDateText
              value={practice.startsAt}
              kind="event"
              timeZone={practice.timeZone}
              absolute={formatFullDate(practice.startsAt, practice.timeZone)}
              style={styles.metaText}
            />
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Icon color={c.textTertiary} name="clock" size={14} />
          <ZonedTimeText
            startsAt={practice.startsAt}
            endsAt={practice.endsAt}
            timeZone={practice.timeZone}
            style={styles.metaText}
          />
        </View>
        {practice.location ? (
          <View style={styles.metaRow}>
            <Icon color={c.textTertiary} name="mapPin" size={14} />
            <Text numberOfLines={1} style={styles.metaText}>
              {practice.location}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.primaryBg,
      borderColor: c.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.sm,
    },
    cardCompact: {
      padding: spacing.xs,
    },
    pressed: { opacity: 0.86 },
    titleRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.xs,
    },
    title: {
      color: c.text,
      flex: 1,
      fontSize: 15,
      fontWeight: "700",
    },
    draft: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    draftText: {
      color: c.primaryText,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    yards: {
      color: c.text,
      fontSize: 13,
      fontWeight: "600",
      marginTop: 4,
    },
    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
    },
    tag: {
      backgroundColor: c.primary,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    tagText: {
      color: c.primaryText,
      fontSize: 11,
      fontWeight: "700",
    },
    meta: {
      gap: 4,
      marginTop: spacing.xs,
    },
    metaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 6,
    },
    metaText: {
      color: c.textSecondary,
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
    },
  })
}
