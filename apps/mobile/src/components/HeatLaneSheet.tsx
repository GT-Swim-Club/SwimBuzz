import { useState } from "react"
import { View } from "react-native"
import {
  HEAT_LANE_MAX,
  normalizeHeatStartTime,
  SUMMARY_ROUNDS,
  type HeatLaneFields,
  type SetHeatLaneInput,
  type SummaryRoundKind,
} from "@swimbuzz/shared"
import { Body, BottomSheet, Button, Chip, Muted, TextField, usePalette } from "@swimbuzz/ui"
import { spacing } from "@swimbuzz/tokens"

type Field = "heat" | "heatTotal" | "lane" | "startTime"
type Form = Record<Field, string> & { round: SummaryRoundKind | "" }
const FIELDS: Field[] = ["heat", "heatTotal", "lane", "startTime"]

/** One round of a row: what imports have and what the coach added. */
export type HeatLaneSlot = {
  slot: SummaryRoundKind
  imported: HeatLaneFields
  coach: HeatLaneFields
  /** The row has no imported round (always its T round), so the coach can pick one. */
  roundEditable?: boolean
}

function formFrom(fields: HeatLaneFields): Form {
  return {
    heat: fields.heat != null ? String(fields.heat) : "",
    heatTotal: fields.heatTotal != null ? String(fields.heatTotal) : "",
    lane: fields.lane != null ? String(fields.lane) : "",
    startTime: fields.startTime ?? "",
    round: fields.round ?? "",
  }
}

const isLocked = (s: HeatLaneSlot, field: Field) => s.imported[field] != null && s.imported[field] !== ""

/** The input for one round, or an error message. */
function slotInput(
  row: Omit<SetHeatLaneInput, Field | "slot" | "round">,
  s: HeatLaneSlot,
  form: Form
): SetHeatLaneInput | string {
  // An imported field keeps any coach value stored underneath, for if the import goes away.
  const number = (field: "heat" | "heatTotal" | "lane", label: string): number | null | string => {
    if (isLocked(s, field)) return s.coach[field] ?? null
    const text = form[field].trim()
    if (!text) return null
    const n = Number(text)
    return Number.isInteger(n) && n >= 1 && n <= HEAT_LANE_MAX
      ? n
      : `${label} must be a whole number from 1 to ${HEAT_LANE_MAX}`
  }
  const heat = number("heat", "Heat")
  const heatTotal = number("heatTotal", "Heats in event")
  const lane = number("lane", "Lane")
  for (const v of [heat, heatTotal, lane]) if (typeof v === "string") return v
  const startTime = isLocked(s, "startTime") ? (s.coach.startTime ?? "") : normalizeHeatStartTime(form.startTime)
  if (startTime == null) return "Enter a start time like 9:30 AM"
  const h = s.imported.heat ?? (heat as number | null)
  const total = s.imported.heatTotal ?? (heatTotal as number | null)
  if (h != null && total != null && h > total) return "Heat can't be more than the heats in the event"
  return {
    ...row,
    slot: s.slot,
    heat: heat as number | null,
    heatTotal: heatTotal as number | null,
    lane: lane as number | null,
    startTime: startTime || null,
    round: s.roundEditable ? form.round || null : (s.coach.round ?? null),
  }
}

/**
 * Coach heat, heats in event, lane and start time for a roster summary row, one section per round
 * it stands for — and its round, when no import has given it one. Imported values show read-only;
 * only the ones no import has can be filled in.
 */
export function HeatLaneSheet({
  visible,
  onClose,
  title,
  row,
  slots,
  onSave,
}: {
  visible: boolean
  onClose: () => void
  /** "100 Free · Smith, Jane" */
  title: string
  row: Omit<SetHeatLaneInput, Field | "slot" | "round">
  slots: HeatLaneSlot[]
  /** Saves each changed round; rejects with a message to show. */
  onSave: (inputs: SetHeatLaneInput[]) => Promise<void>
}) {
  const c = usePalette()
  const [forms, setForms] = useState<Form[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset the form each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(false)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (visible) {
      setForms(slots.map((s) => formFrom(s.coach)))
      setError(null)
    }
  }

  const hasCoach = slots.some(
    (s) =>
      (s.roundEditable && s.coach.round != null) || FIELDS.some((f) => !isLocked(s, f) && s.coach[f] != null)
  )
  const roundEditable = slots.some((s) => s.roundEditable)
  const anyLocked = slots.some((s) => FIELDS.some((f) => isLocked(s, f)))

  async function submit(values: Form[]) {
    const inputs: SetHeatLaneInput[] = []
    for (const [i, s] of slots.entries()) {
      const result = slotInput(row, s, values[i] ?? formFrom({}))
      if (typeof result === "string") {
        setError(slots.length > 1 ? `${roundLabel(s.slot)}: ${result}` : result)
        return
      }
      inputs.push(result)
    }
    setError(null)
    setSaving(true)
    try {
      await onSave(inputs)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save heat & lane")
    } finally {
      setSaving(false)
    }
  }

  const setField = (i: number, field: Field | "round", value: string) =>
    setForms((all) => all.map((f, j) => (j === i ? { ...f, [field]: value } : f)))

  return (
    <BottomSheet
      visible={visible}
      onClose={saving ? () => {} : onClose}
      title={roundEditable ? "Round, heat & lane" : "Heat & lane"}
    >
      <Body style={{ fontWeight: "700", marginBottom: spacing.sm }}>{title}</Body>
      {slots.map((s, i) => {
        const form = forms[i] ?? formFrom(s.coach)
        const shown = formFrom(s.imported)
        const field = (key: Field, label: string, placeholder?: string) => (
          <View style={{ flex: key === "startTime" ? undefined : 1 }}>
            <TextField
              label={label}
              value={isLocked(s, key) ? shown[key] : form[key]}
              editable={!isLocked(s, key) && !saving}
              onChangeText={(text) => setField(i, key, text)}
              placeholder={placeholder}
              keyboardType={key === "startTime" ? "default" : "number-pad"}
              autoCapitalize="characters"
              autoCorrect={false}
              style={isLocked(s, key) ? { backgroundColor: c.fillSecondary, color: c.textSecondary } : undefined}
            />
          </View>
        )
        return (
          <View key={s.slot} style={{ marginBottom: spacing.sm }}>
            {slots.length > 1 ? (
              <Muted style={{ fontWeight: "600", marginBottom: spacing.xxs }}>{roundLabel(s.slot)}</Muted>
            ) : null}
            {s.roundEditable ? (
              <View style={{ marginBottom: spacing.sm }}>
                <Muted style={{ fontWeight: "600", marginBottom: spacing.xxs }}>Round</Muted>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {SUMMARY_ROUNDS.map((r) => (
                    <Chip
                      key={r.kind}
                      label={r.label}
                      selected={form.round === r.kind}
                      // Tapping the picked round again unsets it.
                      onPress={() => setField(i, "round", form.round === r.kind ? "" : r.kind)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {field("heat", "Heat")}
              {field("heatTotal", "Heats in event")}
              {field("lane", "Lane")}
            </View>
            {field("startTime", "Heat start time", "9:30 AM")}
          </View>
        )
      })}
      {anyLocked ? (
        <Muted style={{ marginBottom: spacing.sm }}>
          Grayed-out values come from the heat sheet or results and can't be changed here.
        </Muted>
      ) : null}
      {error ? <Body style={{ color: c.error, marginBottom: spacing.sm }}>{error}</Body> : null}
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {hasCoach ? (
          <Button
            label="Clear"
            variant="danger"
            disabled={saving}
            onPress={() => void submit(slots.map(() => formFrom({})))}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} style={{ flex: 1 }} />
        <Button label="Save" loading={saving} onPress={() => void submit(forms)} style={{ flex: 1 }} />
      </View>
    </BottomSheet>
  )
}

function roundLabel(slot: SummaryRoundKind): string {
  return SUMMARY_ROUNDS.find((r) => r.kind === slot)?.label ?? ""
}
