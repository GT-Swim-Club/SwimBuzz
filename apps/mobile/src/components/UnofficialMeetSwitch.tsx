import { Switch, View } from "react-native"
import { Body, Muted, usePalette } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"

const UNOFFICIAL_DESCRIPTION =
  "Intrasquads and time trials. Times are marked with * and count toward records and Top 10s only in 25s."

/** Staff switch for a meet setting; by default the one marking a meet unofficial (intrasquads, time trials). */
export function UnofficialMeetSwitch({
  value,
  onChange,
  disabled,
  label = "Unofficial meet",
  description = UNOFFICIAL_DESCRIPTION,
}: {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
}) {
  const c = usePalette()
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Body style={{ fontWeight: "600" }}>{label}</Body>
        <Muted>{description}</Muted>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: c.switchTrack, true: c.primary }}
        thumbColor={c.switchThumb}
      />
    </View>
  )
}
