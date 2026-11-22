import { useState } from "react"
import { Alert, Pressable, StyleSheet, View } from "react-native"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  athleteStatusIcons,
  CLEARANCE_CHECK_LABEL,
  CLEARANCE_CHECKS,
  type AthleteClearanceStatus,
  type AthleteClearanceSummary,
  type AthleteStatusIcon,
  type AthleteStatusTone,
  type ClearanceCheck,
} from "@swimbuzz/shared"
import { BottomSheet, Button, Chip, Muted, usePalette } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../lib/api"
import { Icon } from "./Icon"

type Palette = ReturnType<typeof usePalette>

/** complete = green, partial = yellow, missing = red. */
function toneColor(c: Palette, tone: AthleteStatusTone): string {
  if (tone === "complete") return c.successText
  if (tone === "partial") return c.warningText
  return c.error
}

type Draft = Record<ClearanceCheck, boolean>

function draftFrom(status: AthleteClearanceStatus): Draft {
  return { physical: status.physical.cleared, concussion: status.concussion.cleared }
}

/**
 * Staff only: status icons beside the athlete's name on their profile — physical, concussion
 * test, SwimCloud times — green / yellow / red. There's no hover on touch, so a tap explains
 * the status: a clearance icon opens the edit sheet; the stopwatch offers a times import request.
 */
export function AthleteStatusIcons({
  athleteId,
  swimCloudIds,
  timesSyncedAt,
  onRequestImport,
  canEdit = true,
}: {
  athleteId: string
  swimCloudIds: readonly unknown[]
  timesSyncedAt: string | null
  onRequestImport?: () => void
  /** Staff: tap a clearance icon to correct it. Otherwise it just shows its status. */
  canEdit?: boolean
}) {
  const c = usePalette()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const { data } = useQuery({
    queryKey: ["athlete-clearance", athleteId],
    queryFn: () => api.getAthleteClearance(athleteId),
  })
  const status = data?.clearance
  const items = athleteStatusIcons({ clearance: status, swimCloudIds, timesSyncedAt })

  function press(item: AthleteStatusIcon) {
    if (item.key === "swimcloud") {
      const linked = swimCloudIds.length > 0
      if (linked && onRequestImport) {
        Alert.alert("SwimCloud times", item.label, [
          { text: "Cancel", style: "cancel" },
          { text: "Request import", onPress: onRequestImport },
        ])
      } else {
        Alert.alert("SwimCloud times", linked ? item.label : `${item.label}. A coach can add a SwimCloud ID.`)
      }
      return
    }
    if (!canEdit) {
      Alert.alert(item.key === "physical" ? "Physical" : "Concussion test", item.label)
      return
    }
    if (status) setDraft(draftFrom(status))
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      await api.updateAthleteClearance(athleteId, {
        physical: { cleared: draft.physical },
        concussion: { cleared: draft.concussion },
      })
      setDraft(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["athlete-clearance", athleteId] }),
        queryClient.invalidateQueries({ queryKey: ["clearance"] }),
        queryClient.invalidateQueries({ queryKey: ["athletes"] }),
      ])
    } catch (err) {
      Alert.alert("Could not save clearance", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <View style={styles.icons}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => press(item)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            style={({ pressed }) => [styles.icon, pressed && { opacity: 0.6 }]}
          >
            <Icon name={item.icon} size={20} color={toneColor(c, item.tone)} />
          </Pressable>
        ))}
      </View>

      <BottomSheet visible={draft != null} onClose={saving ? () => {} : () => setDraft(null)} title="Clearance">
        <Muted style={{ marginBottom: spacing.sm }}>Each is done once, not every season.</Muted>
        {draft
          ? CLEARANCE_CHECKS.map((check) => (
              <View key={check} style={{ marginBottom: spacing.sm }}>
                <Muted>{CLEARANCE_CHECK_LABEL[check]}</Muted>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  <Chip
                    label="Complete"
                    selected={draft[check]}
                    onPress={() => setDraft((d) => d && { ...d, [check]: true })}
                  />
                  <Chip
                    label="Incomplete"
                    selected={!draft[check]}
                    onPress={() => setDraft((d) => d && { ...d, [check]: false })}
                  />
                </View>
              </View>
            ))
          : null}
        <View style={styles.actions}>
          <Button
            label="Cancel"
            variant="secondary"
            disabled={saving}
            onPress={() => setDraft(null)}
            style={{ flex: 1 }}
          />
          <Button label="Save" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
        </View>
      </BottomSheet>
    </>
  )
}

/**
 * Staff only: compact, display-only status icons for a roster row or tile (the row itself opens the
 * athlete): bare icons side by side. Status is in the accessibility label since there's no hover on touch.
 */
export function AthleteStatusRowIcons({
  clearance,
  swimCloudIds,
  timesSyncedAt,
}: {
  clearance?: AthleteClearanceSummary | null
  swimCloudIds?: readonly unknown[] | null
  timesSyncedAt?: string | null
}) {
  const c = usePalette()
  const items = athleteStatusIcons({ clearance, swimCloudIds, timesSyncedAt })
  return (
    <View style={styles.rowIcons} accessible accessibilityLabel={items.map((i) => i.label).join(", ")}>
      {items.map((item) => (
        <Icon key={item.key} name={item.icon} size={15} color={toneColor(c, item.tone)} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // Same 2pt gap as the staff badge beside it, so the name and every icon sit evenly apart.
  icons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  icon: {
    padding: 2,
  },
  rowIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
})
