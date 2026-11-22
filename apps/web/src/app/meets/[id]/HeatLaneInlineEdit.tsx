"use client"

import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react"
import {
  HEAT_LANE_EDITS_OVERRIDE_IMPORTS,
  HEAT_LANE_MAX,
  normalizeHeatStartTime,
  SUMMARY_ROUNDS,
  type HeatLaneFields,
  type SetHeatLaneInput,
  type SummaryRoundKind,
} from "@swimbuzz/shared"
import { LedgerIcon } from "@/components/meet/Ledger"
import { TimePicker } from "@/components/ui/CustomDateTimePicker"
import HoverDetail from "@/components/ui/HoverDetail"
import { useEscapeToClose } from "@/lib/use-escape-to-close"
import { setHeatLane } from "./meet-entries.actions"

type Field = "heat" | "heatTotal" | "lane" | "startTime"
type Form = Record<Field, string> & { round: SummaryRoundKind | "" }

/** What a coach can fill in on one roster summary row's round, edited inline in its swim detail. */
export type HeatLaneEdit = {
  meetId: string
  /** Which row and round to save to. */
  row: Omit<SetHeatLaneInput, Field | "round">
  imported: HeatLaneFields
  coach: HeatLaneFields
  /** The row has no imported round, so the coach can pick one. */
  roundEditable: boolean
  /** Shows the values on the page while they save; called inside the save's transition. */
  onSaving?: (input: SetHeatLaneInput) => void
}

/** The parts of the swim detail that open inline: the subtitle's round, the Heat cell, the Lane cell. */
export type HeatLaneGroup = "round" | "heat" | "lane"

const HEAT_FIELDS = ["heat", "heatTotal", "startTime"] as const

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
 * Inline editing of a row's coach round, heat, heats in event, lane and start time. Imported values
 * stay read-only; only the ones no import has can be filled in. One group is open at a time.
 */
export function useHeatLaneEditor(edit: HeatLaneEdit | undefined) {
  const [editing, setEditing] = useState<HeatLaneGroup | null>(null)
  const [form, setForm] = useState<Form>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  // Saves don't block: the editor closes at once and another field can be edited meanwhile.
  const [, startTransition] = useTransition()

  const cancel = () => {
    setEditing(null)
    setError(null)
  }
  // Escape closes the open editor, not the swim detail around it.
  useEscapeToClose(editing != null, cancel)

  // Imported values are read-only, unless coach values may replace them (testing).
  const locked = (field: Field) =>
    !HEAT_LANE_EDITS_OVERRIDE_IMPORTS && edit?.imported[field] != null && edit.imported[field] !== ""
  const can = (group: HeatLaneGroup) =>
    edit != null &&
    (group === "round" ? edit.roundEditable : group === "lane" ? !locked("lane") : HEAT_FIELDS.some((f) => !locked(f)))

  const start = (group: HeatLaneGroup) => {
    if (!edit) return
    // When imports can be replaced, start from what's shown: the coach's value, else the import's.
    setForm(formFrom(HEAT_LANE_EDITS_OVERRIDE_IMPORTS ? { ...edit.imported, ...edit.coach } : edit.coach))
    setError(null)
    setEditing(group)
  }

  const save = () => {
    if (!edit) return
    const { imported, coach } = edit
    // An imported field keeps any coach value stored underneath, for if the import goes away.
    const number = (field: "heat" | "heatTotal" | "lane", label: string): number | null | string => {
      if (locked(field)) return coach[field] ?? null
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
    for (const v of [heat, heatTotal, lane]) {
      if (typeof v === "string") return setError(v)
    }
    const startTime = locked("startTime") ? (coach.startTime ?? "") : normalizeHeatStartTime(form.startTime)
    if (startTime == null) return setError("Enter a start time like 9:30 AM")
    const shownHeat = HEAT_LANE_EDITS_OVERRIDE_IMPORTS
      ? ((heat as number | null) ?? imported.heat)
      : (imported.heat ?? (heat as number | null))
    const shownTotal = HEAT_LANE_EDITS_OVERRIDE_IMPORTS
      ? ((heatTotal as number | null) ?? imported.heatTotal)
      : (imported.heatTotal ?? (heatTotal as number | null))
    if (shownHeat != null && shownTotal != null && shownHeat > shownTotal) {
      return setError("Heat can't be more than the heats in the event")
    }
    const input: SetHeatLaneInput = {
      ...edit.row,
      heat: heat as number | null,
      heatTotal: heatTotal as number | null,
      lane: lane as number | null,
      startTime: startTime || null,
      // A round an import has since replaced stays stored underneath, like heat & lane.
      round: edit.roundEditable ? form.round || null : (coach.round ?? null),
    }
    // Close at once: the new values show while the save and the page refresh run behind them.
    const group = editing
    setError(null)
    setEditing(null)
    startTransition(async () => {
      edit.onSaving?.(input)
      try {
        await setHeatLane(edit.meetId, input)
      } catch (err) {
        // The shown values fall back on their own; reopen the edit with what was typed.
        setEditing(group)
        setError(err instanceof Error ? err.message : "Failed to save heat & lane")
      }
    })
  }

  return { edit, editing, form, setForm, error, locked, can, start, cancel, save }
}

export type HeatLaneEditor = ReturnType<typeof useHeatLaneEditor>

const ICON_BUTTON =
  "relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-foreground-tertiary transition-colors hover:bg-fill hover:text-foreground disabled:opacity-50"

const INPUT =
  "h-7 rounded-md border border-border bg-background px-1.5 font-mono text-sm tabular-nums text-foreground outline-none focus:border-primary disabled:opacity-60"

const NUMBER_INPUT = `${INPUT} w-11 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`

const GROUP_LABEL: Record<HeatLaneGroup, string> = { round: "round", heat: "heat", lane: "lane" }

/** The pencil beside a value a coach can fill in. */
export function HeatLanePencil({ editor, group }: { editor: HeatLaneEditor; group: HeatLaneGroup }) {
  if (!editor.can(group) || editor.editing === group) return null
  const label = `Edit ${GROUP_LABEL[group]}`
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => editor.start(group)}
      className={ICON_BUTTON}
    >
      <LedgerIcon name="pencil" className="h-3 w-3" />
      <HoverDetail label={label} />
    </button>
  )
}

/** Save and cancel for the open group. */
export function HeatLaneActions({ editor }: { editor: HeatLaneEditor }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label="Save"
        onClick={editor.save}
        className={`${ICON_BUTTON} text-success-text hover:text-success-text`}
      >
        <LedgerIcon name="check" className="h-3.5 w-3.5" />
        <HoverDetail label="Save" />
      </button>
      <button
        type="button"
        aria-label="Cancel"
        onClick={editor.cancel}
        className={ICON_BUTTON}
      >
        <LedgerIcon name="x" className="h-3.5 w-3.5" />
        <HoverDetail label="Cancel" />
      </button>
    </span>
  )
}

function onEnter(editor: HeatLaneEditor) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      editor.save()
    }
  }
}

function NumberInput({
  editor,
  field,
  label,
  autoFocus,
}: {
  editor: HeatLaneEditor
  field: "heat" | "heatTotal" | "lane"
  label: string
  autoFocus?: boolean
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={HEAT_LANE_MAX}
      step={1}
      aria-label={label}
      autoFocus={autoFocus}
      value={editor.form[field]}
      onChange={(e) => editor.setForm((f) => ({ ...f, [field]: e.target.value }))}
      onKeyDown={onEnter(editor)}
      className={NUMBER_INPUT}
    />
  )
}

/** The Heat cell's inputs: "[heat] of [heats]" and the start time, imported parts as plain text. */
export function HeatInputs({ editor }: { editor: HeatLaneEditor }) {
  const imported = editor.edit?.imported ?? {}
  const firstOpen = HEAT_FIELDS.find((f) => !editor.locked(f))
  return (
    <span className="flex flex-col items-start gap-1.5">
      <span className="inline-flex items-center gap-1.5">
        {editor.locked("heat") ? (
          <span>{imported.heat}</span>
        ) : (
          <NumberInput editor={editor} field="heat" label="Heat" autoFocus={firstOpen === "heat"} />
        )}
        <span className="font-sans text-xs text-foreground-tertiary">of</span>
        {editor.locked("heatTotal") ? (
          <span>{imported.heatTotal}</span>
        ) : (
          <NumberInput
            editor={editor}
            field="heatTotal"
            label="Heats in event"
            autoFocus={firstOpen === "heatTotal"}
          />
        )}
      </span>
      {editor.locked("startTime") ? (
        <span className="text-xs text-foreground-secondary">{imported.startTime}</span>
      ) : (
        <StartTimeField editor={editor} autoFocus={firstOpen === "startTime"} />
      )}
    </span>
  )
}

/** The heat start time, in the app's time picker (its value is "HH:MM", like the native input's), sized like the inline number inputs. */
function StartTimeField({ editor, autoFocus }: { editor: HeatLaneEditor; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (autoFocus) ref.current?.querySelector("input")?.focus()
  }, [autoFocus])
  return (
    <div ref={ref} className="w-[5.75rem] tabular-nums">
      <TimePicker
        value={editor.form.startTime}
        onChange={(value) => editor.setForm((f) => ({ ...f, startTime: value }))}
        ariaLabel="Heat start time"
        placeholder="--:-- --"
        compact
        // Focused on open for typing; the picker waits for a click.
        openOnFocus={false}
      />
    </div>
  )
}

/** The Lane cell's input. */
export function LaneInput({ editor }: { editor: HeatLaneEditor }) {
  return <NumberInput editor={editor} field="lane" label="Lane" autoFocus />
}

/** The subtitle's round picker. */
export function RoundSelect({ editor }: { editor: HeatLaneEditor }) {
  return (
    <select
      aria-label="Round"
      autoFocus
      value={editor.form.round}
      onChange={(e) => editor.setForm((f) => ({ ...f, round: e.target.value as Form["round"] }))}
      className="h-7 rounded-md border border-border bg-background px-1.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
    >
      <option value="">Not set</option>
      {SUMMARY_ROUNDS.map((r) => (
        <option key={r.kind} value={r.kind}>
          {r.label}
        </option>
      ))}
    </select>
  )
}

/** A value with its pencil, or the group's inputs and save/cancel while it's open. */
export function HeatLaneEditable({
  editor,
  group,
  value,
  inputs,
  className = "",
}: {
  editor: HeatLaneEditor
  group: HeatLaneGroup
  value: ReactNode
  inputs: ReactNode
  className?: string
}) {
  if (editor.editing === group) {
    return (
      <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {inputs}
        <HeatLaneActions editor={editor} />
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {value}
      <HeatLanePencil editor={editor} group={group} />
    </span>
  )
}
