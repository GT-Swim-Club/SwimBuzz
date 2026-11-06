import { useMemo } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { relayShareEventKey, type RelayShareEvent } from "@swimbuzz/shared"
import { BottomSheet, Button, Muted, usePalette } from "@swimbuzz/ui"
import { spacing, type ColorPalette } from "@swimbuzz/tokens"
import { useThemePreference } from "../lib/theme"
import { Icon } from "./Icon"

/**
 * Pick which relay events go in the image saved to Photos. The picks live with the caller, which
 * renders the off-screen capture from them.
 */
export function RelayPngPickerSheet({
  visible,
  onClose,
  events,
  picked,
  onPickedChange,
  saving,
  onSave,
}: {
  visible: boolean
  onClose: () => void
  /** Published relays only, in display order. */
  events: RelayShareEvent[]
  /** Picked event keys (relayShareEventKey). */
  picked: Set<string>
  onPickedChange: (picked: Set<string>) => void
  saving: boolean
  onSave: () => void
}) {
  const c = usePalette()
  const { colorScheme } = useThemePreference()
  const brandColor = colorScheme === "dark" ? c.primaryHover : c.primaryActive
  const styles = useMemo(() => makeStyles(c), [c])
  const pickedCount = events.filter((event) => picked.has(relayShareEventKey(event))).length
  const allPicked = pickedCount === events.length

  function toggle(key: string) {
    const next = new Set(picked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onPickedChange(next)
  }

  return (
    <BottomSheet visible={visible} onClose={saving ? () => {} : onClose} title="Save PNG of…">
      <View style={styles.header}>
        <Muted>
          {pickedCount} of {events.length} events
        </Muted>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() =>
            onPickedChange(allPicked ? new Set() : new Set(events.map(relayShareEventKey)))
          }
        >
          <Text style={[styles.link, { color: brandColor }]}>
            {allPicked ? "Deselect all" : "Select all"}
          </Text>
        </Pressable>
      </View>
      <ScrollView style={styles.list}>
        {events.map((event) => {
          const key = relayShareEventKey(event)
          const checked = picked.has(key)
          return (
            <Pressable
              key={key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => toggle(key)}
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
                {event.name}
              </Text>
              <Muted>{event.relays.map((relay) => relay.letter).join(" · ")}</Muted>
            </Pressable>
          )
        })}
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} style={{ flex: 1 }} />
        <Button
          label="Save to Photos"
          loading={saving}
          disabled={pickedCount === 0}
          onPress={onSave}
          style={{ flex: 1 }}
        />
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
      marginBottom: spacing.xs,
    },
    link: {
      fontSize: 13,
      fontWeight: "600",
    },
    list: {
      flexGrow: 0,
      marginBottom: spacing.md,
      maxHeight: 360,
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
    actions: {
      flexDirection: "row",
      gap: spacing.sm,
    },
  })
}
