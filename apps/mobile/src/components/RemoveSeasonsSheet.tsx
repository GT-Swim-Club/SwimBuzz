import { useMemo } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { BottomSheet, Button, Muted, usePalette } from "@swimbuzz/ui"
import { spacing, type ColorPalette } from "@swimbuzz/tokens"
import { useThemePreference } from "../lib/theme"
import { Icon } from "./Icon"

/**
 * Take an athlete on more than one season off some of those seasons' rosters. Checking every
 * season isn't allowed — deleting them entirely is the separate "Delete permanently" step.
 */
export function RemoveSeasonsSheet({
  visible,
  onClose,
  name,
  seasons,
  picked,
  onPickedChange,
  removing,
  onRemove,
  onDeletePermanently,
}: {
  visible: boolean
  onClose: () => void
  name: string
  seasons: string[]
  picked: Set<string>
  onPickedChange: (picked: Set<string>) => void
  removing: boolean
  onRemove: () => void
  onDeletePermanently: () => void
}) {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const brandColor = colorScheme === "dark" ? c.primaryHover : c.primaryActive
  const styles = useMemo(() => makeStyles(c), [c])
  // "2025-2026" labels sort chronologically as strings; newest first.
  const ordered = useMemo(() => [...seasons].sort().reverse(), [seasons])
  const pickedCount = seasons.filter((season) => picked.has(season)).length
  const pickedAll = pickedCount === seasons.length

  function toggle(season: string) {
    const next = new Set(picked)
    if (next.has(season)) next.delete(season)
    else next.add(season)
    onPickedChange(next)
  }

  return (
    <BottomSheet visible={visible} onClose={removing ? () => {} : onClose} title="Remove from season">
      <Muted>Take {name} off these seasons&apos; rosters. Their swims and team history stay.</Muted>
      <ScrollView style={styles.list}>
        {ordered.map((season) => {
          const checked = picked.has(season)
          return (
            <Pressable
              key={season}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled: removing }}
              disabled={removing}
              onPress={() => toggle(season)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.bgHover }]}
            >
              <View
                style={[
                  styles.box,
                  checked
                    ? { backgroundColor: brandColor, borderColor: brandColor }
                    : { borderColor: c.border },
                ]}
              >
                {checked ? (
                  <Icon color={c.primaryContrast} name="check" size={11} strokeWidth={3} />
                ) : null}
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {formatSeasonLabel(season)}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
      {pickedAll ? (
        <Text style={[styles.hint, { color: c.warningText }]}>
          An athlete has to stay on at least one season. To remove them entirely, delete them permanently.
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" disabled={removing} onPress={onClose} style={{ flex: 1 }} />
        <Button
          label="Remove"
          variant="danger"
          loading={removing}
          disabled={pickedCount === 0 || pickedAll}
          onPress={onRemove}
          style={{ flex: 1 }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={removing}
        hitSlop={8}
        onPress={onDeletePermanently}
        style={styles.deleteLink}
      >
        <Text style={[styles.link, { color: c.error }]}>Delete permanently…</Text>
      </Pressable>
    </BottomSheet>
  )
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    list: {
      flexGrow: 0,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
      maxHeight: 320,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      minHeight: 44,
      paddingVertical: 6,
    },
    box: {
      alignItems: "center",
      borderRadius: 5,
      borderWidth: 1.5,
      height: 18,
      justifyContent: "center",
      width: 18,
    },
    rowLabel: {
      color: c.text,
      flex: 1,
      fontSize: 15,
      fontWeight: "500",
    },
    hint: {
      fontSize: 13,
      marginBottom: spacing.sm,
    },
    actions: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    deleteLink: {
      alignSelf: "center",
      marginTop: spacing.md,
    },
    link: {
      fontSize: 14,
      fontWeight: "600",
    },
  })
}
