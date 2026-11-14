import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { usePalette } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"

/** One jump button: a letter ("B") or an event number ("12"), keyed to the group it scrolls to. */
export type RosterSummaryJumpTarget = {
  key: string
  label: string
  /** Spoken name, e.g. "Event 12, Women 200 Free" or "Athletes starting with B". */
  accessibilityLabel: string
}

/** "A"–"Z" for a name ("Last, First"), or "#" when it doesn't start with a letter. */
export function rosterSummaryJumpLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : "#"
}

/**
 * The roster summary's jump bar (mirrors the web's SummaryJumpNav): letter buttons when grouped by
 * athlete, event-number buttons when grouped by event, in one row that scrolls sideways. Hidden
 * with fewer than two targets. Only on screen — the PNG/PDF exports are drawn from the export
 * request, so it never shows in them.
 */
export function RosterSummaryJumpBar({
  targets,
  onJump,
}: {
  targets: RosterSummaryJumpTarget[]
  onJump: (key: string) => void
}) {
  const c = usePalette()
  if (targets.length < 2) return null
  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {targets.map((target) => (
          <Pressable
            key={target.key}
            accessibilityRole="button"
            accessibilityLabel={target.accessibilityLabel}
            onPress={() => onJump(target.key)}
            hitSlop={4}
            style={({ pressed }) => [
              styles.button,
              { borderColor: c.borderSecondary, backgroundColor: pressed ? c.bgHover : c.bgContainer },
            ]}
          >
            <Text style={[styles.label, { color: c.textSecondary }]}>{target.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { marginTop: spacing.sm, marginBottom: spacing.sm },
  row: { gap: spacing.xxs },
  button: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] },
})
