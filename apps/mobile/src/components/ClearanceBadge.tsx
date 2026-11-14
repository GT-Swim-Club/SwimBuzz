import { Text, View } from "react-native"
import { usePalette } from "@swimbuzz/ui"
import { clearanceFlagLabel, type ClearanceCheck } from "@swimbuzz/shared"

/**
 * Amber pill for an athlete missing a physical and/or concussion test ("No physical",
 * "No concussion test", "Not cleared"). Renders nothing when cleared. Staff-only surfaces.
 */
export function ClearanceBadge({ missing }: { missing: ClearanceCheck[] | null | undefined }) {
  const c = usePalette()
  const label = clearanceFlagLabel(missing ?? [])
  if (!label) return null
  return (
    <View
      accessibilityLabel={label}
      style={{
        borderWidth: 1,
        borderColor: c.warningBorder,
        backgroundColor: c.warningBg,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 1,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: c.warningText,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
