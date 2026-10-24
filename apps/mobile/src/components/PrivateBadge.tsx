import { StyleSheet, Text, View } from "react-native"
import { usePalette } from "@swimbuzz/ui"

/** Marks a practice only its owner can see. */
export function PrivateBadge() {
  const c = usePalette()
  return (
    <View
      accessibilityLabel="Private practice, only you can see it"
      style={[styles.badge, { borderColor: c.accent, backgroundColor: c.primaryBg }]}
    >
      <Text style={[styles.text, { color: c.accent }]}>Private</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
})
