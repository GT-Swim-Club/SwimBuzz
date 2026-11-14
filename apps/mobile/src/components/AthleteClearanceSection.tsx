import { useState } from "react"
import { Alert, View } from "react-native"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CLEARANCE_CHECK_LABEL,
  CLEARANCE_CHECKS,
  formatClearanceDate,
  formatSeasonLabel,
  missingClearance,
  type AthleteClearanceStatus,
  type ClearanceCheck,
} from "@swimbuzz/shared"
import { Button, Chip, MetaRow, Muted, Section } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"
import { api } from "../lib/api"
import { ClearanceBadge } from "./ClearanceBadge"
import { DateSelector } from "./DateTimeSelector"

type Draft = Record<ClearanceCheck, { cleared: boolean; date: string }>

function draftFrom(status: AthleteClearanceStatus): Draft {
  return {
    physical: { cleared: status.physical.cleared, date: status.physical.date ?? "" },
    concussion: { cleared: status.concussion.cleared, date: status.concussion.date ?? "" },
  }
}

/**
 * Physical & concussion clearance for the athlete's newest season. Render only for
 * staff or the athlete themself — the server also refuses anyone else. Staff can
 * correct it by hand.
 */
export function AthleteClearanceSection({ athleteId, canEdit }: { athleteId: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const { data } = useQuery({
    queryKey: ["athlete-clearance", athleteId],
    queryFn: () => api.getAthleteClearance(athleteId),
  })

  const status = data?.seasons[0]
  if (!status) return null
  const missing = missingClearance(status)

  async function save() {
    if (!draft || !status) return
    setSaving(true)
    try {
      await api.updateAthleteClearance(athleteId, {
        season: status.season,
        physical: { cleared: draft.physical.cleared, date: draft.physical.date || null },
        concussion: { cleared: draft.concussion.cleared, date: draft.concussion.date || null },
      })
      setDraft(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["athlete-clearance", athleteId] }),
        queryClient.invalidateQueries({ queryKey: ["clearance"] }),
      ])
    } catch (err) {
      Alert.alert("Could not save clearance", err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title={`Clearance · ${formatSeasonLabel(status.season)}`}>
      {missing.length > 0 ? (
        <View style={{ flexDirection: "row", marginBottom: spacing.sm }}>
          <ClearanceBadge missing={missing} />
        </View>
      ) : null}
      {draft ? (
        <>
          {CLEARANCE_CHECKS.map((check) => (
            <View key={check} style={{ marginBottom: spacing.sm }}>
              <Muted>{CLEARANCE_CHECK_LABEL[check]}</Muted>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <Chip
                  label="On file"
                  selected={draft[check].cleared}
                  onPress={() => setDraft((d) => d && { ...d, [check]: { ...d[check], cleared: true } })}
                />
                <Chip
                  label="Not on file"
                  selected={!draft[check].cleared}
                  onPress={() => setDraft((d) => d && { ...d, [check]: { cleared: false, date: "" } })}
                />
              </View>
              {draft[check].cleared ? (
                <DateSelector
                  label="Date"
                  value={draft[check].date}
                  onChange={(date) => setDraft((d) => d && { ...d, [check]: { ...d[check], date } })}
                  optional
                />
              ) : null}
            </View>
          ))}
          <View style={{ gap: spacing.sm }}>
            <Button label="Save clearance" loading={saving} onPress={() => void save()} />
            <Button label="Cancel" variant="secondary" disabled={saving} onPress={() => setDraft(null)} />
          </View>
        </>
      ) : (
        <>
          {CLEARANCE_CHECKS.map((check) => (
            <MetaRow
              key={check}
              label={CLEARANCE_CHECK_LABEL[check]}
              value={
                status[check].cleared
                  ? (formatClearanceDate(status[check].date) ?? "On file")
                  : "Not on file"
              }
            />
          ))}
          {!canEdit && missing.length > 0 ? (
            <Muted style={{ marginTop: spacing.xs }}>Check with your coaches before practice.</Muted>
          ) : null}
          {canEdit ? (
            <View style={{ marginTop: spacing.sm }}>
              <Button label="Edit clearance" variant="secondary" onPress={() => setDraft(draftFrom(status))} />
            </View>
          ) : null}
        </>
      )}
    </Section>
  )
}
