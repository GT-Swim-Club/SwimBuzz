import { useMemo, useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { formatSeasonLabel, MAX_ACADEMIC_YEAR_LENGTH } from "@swimbuzz/shared"
import { BottomSheet, Button, Muted, TextField } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"

/**
 * Staff edit of an athlete's academic year for each season they're on (newest first). A blank
 * field clears that season's year.
 */
export function AthleteYearsSheet({
  visible,
  onClose,
  seasons,
  yearBySeason,
  saving,
  onSave,
}: {
  visible: boolean
  onClose: () => void
  seasons: string[]
  yearBySeason: Record<string, string>
  saving: boolean
  onSave: (yearBySeason: Record<string, string | null>) => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>(yearBySeason)
  // "2025-2026" labels sort chronologically as strings; newest first.
  const ordered = useMemo(() => [...seasons].sort().reverse(), [seasons])

  // Start from what's stored each time the sheet opens (not on every parent render while open).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) setDraft(yearBySeason)
  }

  return (
    <BottomSheet visible={visible} onClose={saving ? () => {} : onClose} title="Year by season">
      <Muted>The athlete&apos;s academic year in each season, e.g. 2, SO or Masters.</Muted>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {ordered.map((season) => (
          <TextField
            key={season}
            label={formatSeasonLabel(season)}
            value={draft[season] ?? ""}
            onChangeText={(text) => setDraft((prev) => ({ ...prev, [season]: text }))}
            maxLength={MAX_ACADEMIC_YEAR_LENGTH}
            autoCapitalize="words"
            editable={!saving}
          />
        ))}
      </ScrollView>
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} style={{ flex: 1 }} />
        <Button
          label="Save"
          loading={saving}
          onPress={() =>
            onSave(Object.fromEntries(seasons.map((season) => [season, draft[season]?.trim() || null])))
          }
          style={{ flex: 1 }}
        />
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
    marginTop: spacing.sm,
    maxHeight: 360,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
})
