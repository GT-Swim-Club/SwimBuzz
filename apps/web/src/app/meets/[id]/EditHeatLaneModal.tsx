"use client"

import { useState, useTransition } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import {
  HEAT_LANE_MAX,
  normalizeHeatStartTime,
  SUMMARY_ROUNDS,
  type HeatLaneFields,
  type SetHeatLaneInput,
  type SummaryRoundKind,
} from "@swimbuzz/shared"
import { setHeatLane } from "./meet-entries.actions"

type Field = "heat" | "heatTotal" | "lane" | "startTime"
type Form = Record<Field, string> & { round: SummaryRoundKind | "" }

/** "03:19 PM" → "15:19", the native time input's value. */
function toTimeInput(time?: string): string {
  const m = time?.match(/^(\d{1,2}):(\d{2})\s*([AP])M$/i)
  if (!m) return ""
  const hour = (Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)
  return `${String(hour).padStart(2, "0")}:${m[2]}`
}

function formFrom(fields: HeatLaneFields): Form {
  return {
    heat: fields.heat != null ? String(fields.heat) : "",
    heatTotal: fields.heatTotal != null ? String(fields.heatTotal) : "",
    lane: fields.lane != null ? String(fields.lane) : "",
    startTime: toTimeInput(fields.startTime),
    round: fields.round ?? "",
  }
}

const EMPTY_FORM: Form = { heat: "", heatTotal: "", lane: "", startTime: "", round: "" }

/**
 * Coach heat, heats in event, lane and start time for one roster summary row's round — and its
 * round, when no import has given it one. Imported values show read-only; only the ones no import
 * has can be filled in.
 */
export default function EditHeatLaneModal({
  meetId,
  row,
  description,
  imported,
  coach,
  roundEditable = false,
  open,
  onOpenChange,
}: {
  meetId: string
  /** Which row and round to save to. */
  row: Omit<SetHeatLaneInput, Field | "round">
  /** "Smith, Jane · 100 Free · Prelims" */
  description: string
  imported: HeatLaneFields
  coach: HeatLaneFields
  /** The row has no imported round, so the coach can pick one. */
  roundEditable?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(() => formFrom(coach))
  const shown = formFrom(imported)
  const locked = (field: Field) => imported[field] != null && imported[field] !== ""
  const hasCoach =
    (roundEditable && coach.round != null) ||
    (["heat", "heatTotal", "lane", "startTime"] as const).some((f) => !locked(f) && coach[f] != null)

  // Reset the form each time the modal opens.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setForm(formFrom(coach))
      setError(null)
    }
  }

  function save(values: Form) {
    // An imported field keeps any coach value stored underneath, for if the import goes away.
    const number = (field: "heat" | "heatTotal" | "lane") =>
      locked(field) ? (coach[field] ?? null) : values[field].trim() ? Number(values[field]) : null
    const input: SetHeatLaneInput = {
      ...row,
      heat: number("heat"),
      heatTotal: number("heatTotal"),
      lane: number("lane"),
      startTime: locked("startTime")
        ? (coach.startTime ?? null)
        : normalizeHeatStartTime(values.startTime) || null,
      // A round an import has since replaced stays stored underneath, like heat & lane.
      round: roundEditable ? values.round || null : (coach.round ?? null),
    }
    const heat = imported.heat ?? input.heat
    const total = imported.heatTotal ?? input.heatTotal
    if (heat != null && total != null && heat > total) {
      setError("Heat can't be more than the heats in the event")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await setHeatLane(meetId, input)
        onOpenChange(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save heat & lane")
      }
    })
  }

  const numberInput = (field: "heat" | "heatTotal" | "lane", label: string) => (
    <div className="min-w-0 flex-1">
      <label htmlFor={`heat-lane-${field}`} className="mb-1 block text-xs font-medium text-foreground-secondary">
        {label}
      </label>
      <input
        id={`heat-lane-${field}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={HEAT_LANE_MAX}
        step={1}
        disabled={locked(field) || isPending}
        value={locked(field) ? shown[field] : form[field]}
        onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm tabular-nums disabled:bg-fill-secondary disabled:text-foreground-secondary"
      />
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      closeDisabled={isPending}
      title={roundEditable ? "Round, heat & lane" : "Heat & lane"}
      description={description}
      maxWidth="md"
      onSubmit={(e) => {
        e.preventDefault()
        save(form)
      }}
      footer={
        <ModalFooter>
          {hasCoach ? (
            <button
              type="button"
              onClick={() => save(EMPTY_FORM)}
              disabled={isPending}
              className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-error hover:bg-fill disabled:opacity-50"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </ModalFooter>
      }
    >
      {roundEditable ? (
        <div>
          <label htmlFor="heat-lane-round" className="mb-1 block text-xs font-medium text-foreground-secondary">
            Round
          </label>
          <select
            id="heat-lane-round"
            value={form.round}
            disabled={isPending}
            onChange={(e) => setForm((f) => ({ ...f, round: e.target.value as Form["round"] }))}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Not set</option>
            {SUMMARY_ROUNDS.map((r) => (
              <option key={r.kind} value={r.kind}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex gap-3">
        {numberInput("heat", "Heat")}
        {numberInput("heatTotal", "Heats in event")}
        {numberInput("lane", "Lane")}
      </div>
      <div>
        <label htmlFor="heat-lane-startTime" className="mb-1 block text-xs font-medium text-foreground-secondary">
          Heat start time
        </label>
        <input
          id="heat-lane-startTime"
          // An imported time shows as the heat sheet printed it.
          type={locked("startTime") ? "text" : "time"}
          disabled={locked("startTime") || isPending}
          value={locked("startTime") ? (imported.startTime ?? "") : form.startTime}
          onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm tabular-nums disabled:bg-fill-secondary disabled:text-foreground-secondary"
        />
      </div>
      {(["heat", "heatTotal", "lane", "startTime"] as const).some(locked) ? (
        <p className="text-xs text-foreground-tertiary">
          Grayed-out values come from the heat sheet or results and can&apos;t be changed here.
        </p>
      ) : null}
      {error && <p className="text-sm text-error">{error}</p>}
    </Modal>
  )
}
