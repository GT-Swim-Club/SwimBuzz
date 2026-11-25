import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { BottomSheet, Button, Chip } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"

type Gender = "M" | "F"

const GENDERS = [
  { value: "F", label: "Women" },
  { value: "M", label: "Men" },
] as const

/** Staff edit of an athlete's gender. */
export function AthleteGenderSheet({
  visible,
  onClose,
  gender,
  saving,
  onSave,
}: {
  visible: boolean
  onClose: () => void
  gender: Gender | null
  saving: boolean
  onSave: (gender: Gender) => void
}) {
  const [draft, setDraft] = useState<Gender | null>(gender)

  // Start from what's stored each time the sheet opens (not on every parent render while open).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setDraft(gender)
  }

  return (
    <BottomSheet visible={visible} onClose={saving ? () => {} : onClose} title="Gender">
      <View style={styles.chips}>
        {GENDERS.map((g) => (
          <Chip
            key={g.value}
            label={g.label}
            selected={draft === g.value}
            onPress={saving ? undefined : () => setDraft(g.value)}
          />
        ))}
      </View>
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} style={{ flex: 1 }} />
        <Button
          label="Save"
          loading={saving}
          disabled={!draft || draft === gender}
          onPress={() => {
            if (draft) onSave(draft)
          }}
          style={{ flex: 1 }}
        />
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
})
