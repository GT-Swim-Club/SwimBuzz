"use client"

import Link from "next/link"
import { createContext, useContext, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react"
import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordItem,
} from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { athletePath } from "@/lib/slug"

/** What staff are typing for one record before it's saved. */
export type RecordDraft = { time: string; year: string; names: string[]; leadoff: boolean }

export function recordKey(gender: RecordGender, event: string): string {
  return `${gender}|${event}`
}

export function draftFromRecord(def: RecordEventDef, record: TeamRecordItem | undefined): RecordDraft {
  const legs = def.relay ? 4 : 1
  return {
    time: record ? formatRecordTime(record.timeMs) : "",
    year: record ? String(record.year) : "",
    names: Array.from({ length: legs }, (_, i) => record?.swimmers[i]?.name ?? ""),
    leadoff: record?.leadoff ?? false,
  }
}

export function sameDraft(a: RecordDraft, b: RecordDraft): boolean {
  return (
    a.time.trim() === b.time.trim() &&
    a.year.trim() === b.year.trim() &&
    a.leadoff === b.leadoff &&
    a.names.every((name, i) => name.trim() === (b.names[i] ?? "").trim())
  )
}

export type RecordsEditing = {
  editing: boolean
  drafts: Record<string, RecordDraft>
  saving: Record<string, boolean>
  errors: Record<string, string>
  confirmingClear: string | null
  setDraft: (key: string, def: RecordEventDef, record: TeamRecordItem | undefined, patch: Partial<RecordDraft>) => void
  commit: (def: RecordEventDef, gender: RecordGender, record: TeamRecordItem | undefined) => void
  revert: (key: string) => void
  askClear: (key: string | null) => void
  clear: (def: RecordEventDef, gender: RecordGender) => void
  openHistory: (def: RecordEventDef, gender: RecordGender) => void
}

export const RecordsEditingContext = createContext<RecordsEditing | null>(null)

function useEditing(): RecordsEditing {
  const value = useContext(RecordsEditingContext)
  if (!value) throw new Error("RecordsEditingContext missing")
  return value
}

export type SideProps = { def: RecordEventDef; gender: RecordGender; record: TeamRecordItem | undefined }

const inputClass =
  "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-foreground-tertiary focus:border-primary focus:ring-[3px] focus:ring-primary/35"
const iconButtonClass =
  "group relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-primary disabled:opacity-50"

/** This season's records in bold gold, like the bold italic on the records sheet. */
export function seasonClass(record: TeamRecordItem | undefined): string {
  return record?.isThisSeason ? "font-semibold text-accent" : "text-foreground"
}

/**
 * One record's cells (year, names, time), wherever the layout puts them. Saves when focus leaves
 * them or on Enter; Escape puts the record back as it was. `display: contents` keeps each cell on
 * the parent grid.
 */
export function RecordSide({ def, gender, record, children }: SideProps & { children: ReactNode }) {
  const editing = useEditing()
  if (!editing.editing) return <>{children}</>
  const key = recordKey(gender, def.event)

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    editing.commit(def, gender, record)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      editing.commit(def, gender, record)
    } else if (event.key === "Escape") {
      editing.revert(key)
      ;(event.target as HTMLElement).blur()
    }
  }

  return (
    <div className="contents" onBlur={onBlur} onKeyDown={onKeyDown} aria-busy={editing.saving[key] || undefined}>
      {children}
    </div>
  )
}

function useSide({ def, gender, record }: SideProps) {
  const editing = useEditing()
  const key = recordKey(gender, def.event)
  const draft = editing.drafts[key] ?? draftFromRecord(def, record)
  const label = `${gender === "F" ? "Women's" : gender === "M" ? "Men's" : ""} ${def.label}`.trim()
  return {
    editing,
    key,
    draft,
    label,
    saving: !!editing.saving[key],
    update: (patch: Partial<RecordDraft>) => editing.setDraft(key, def, record, patch),
  }
}

export function RecordYear(props: SideProps & { className?: string }) {
  const { record, className = "" } = props
  const { editing, draft, label, saving, update } = useSide(props)
  if (editing.editing) {
    return (
      <input
        aria-label={`${label} year`}
        inputMode="numeric"
        maxLength={4}
        placeholder="Year"
        value={draft.year}
        disabled={saving}
        onChange={(e) => update({ year: e.target.value.replace(/\D/g, "") })}
        className={`${inputClass} text-center tabular-nums ${className}`}
      />
    )
  }
  if (!record) return <span className={`text-foreground-tertiary ${className}`}>—</span>
  return (
    <span className={`relative tabular-nums ${seasonClass(record)} ${className}`}>
      {record.year}
      <HoverDetail label={recordSetLabel(record)} />
    </span>
  )
}

export function RecordTime(props: SideProps & { className?: string }) {
  const { record, className = "" } = props
  const { editing, draft, label, saving, update } = useSide(props)
  if (editing.editing) {
    return (
      <input
        aria-label={`${label} time`}
        inputMode="decimal"
        placeholder="0:00.00"
        value={draft.time}
        disabled={saving}
        onChange={(e) => update({ time: e.target.value })}
        className={`${inputClass} text-center font-mono tabular-nums ${className}`}
      />
    )
  }
  if (!record) return <span className={`text-foreground-tertiary ${className}`}>—</span>
  return <span className={`font-mono tabular-nums ${seasonClass(record)} ${className}`}>{formatRecordTime(record.timeMs)}</span>
}

/** Holder (or relay legs 1–4, one per line); staff type names, picking roster athletes from the suggestions. */
export function RecordNames(props: SideProps & { className?: string; align?: "center" | "start" }) {
  const { def, record, className = "", align = "center" } = props
  const { editing, key, draft, label, saving, update } = useSide(props)
  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left"

  if (editing.editing) {
    return (
      <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
        {draft.names.map((name, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              aria-label={def.relay ? `${label} leg ${i + 1}` : `${label} swimmer`}
              list="record-athletes"
              placeholder={def.relay ? `Leg ${i + 1}` : "Swimmer"}
              value={name}
              disabled={saving}
              onChange={(e) => update({ names: draft.names.map((n, j) => (j === i ? e.target.value : n)) })}
              className={`${inputClass} ${align === "center" ? "text-center" : ""}`}
            />
            {!def.relay ? (
              <label className="flex shrink-0 items-center gap-1 text-xs text-foreground-secondary">
                <input
                  type="checkbox"
                  checked={draft.leadoff}
                  disabled={saving}
                  onChange={(e) => update({ leadoff: e.target.checked })}
                  className="accent-primary"
                />
                (R)
                <span className="sr-only">Set leading off a relay</span>
              </label>
            ) : null}
          </div>
        ))}
        {editing.errors[key] ? (
          <p role="alert" className="text-xs text-error">
            {editing.errors[key]}
          </p>
        ) : null}
      </div>
    )
  }

  if (!record) return <span className={`text-foreground-tertiary ${className}`}>—</span>
  return (
    <div className={`flex min-w-0 flex-col ${alignClass} ${seasonClass(record)} ${className}`}>
      {record.swimmers.map((swimmer, i) => {
        const text = recordSwimmerLabel(record, swimmer)
        return swimmer.athleteSlug ? (
          <Link key={i} href={athletePath(swimmer.athleteSlug)} className="max-w-full truncate transition-colors hover:text-primary hover:underline">
            {text}
          </Link>
        ) : (
          <span key={i} className="max-w-full truncate">
            {text}
          </span>
        )
      })}
    </div>
  )
}

/** Staff action on one record while editing: Clear (confirmed inline). History is on the event name. */
export function RecordActions(props: SideProps & { className?: string }) {
  const { def, gender, record, className = "" } = props
  const { editing, key, saving, label } = useSide(props)
  const [busy, setBusy] = useState(false)
  if (!editing.editing) return null

  if (editing.confirmingClear === key) {
    return (
      <div className={`flex flex-col items-center gap-1 text-xs ${className}`}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            editing.clear(def, gender)
          }}
          className="rounded-md bg-error px-2 py-1 font-medium text-error-contrast transition-colors hover:bg-error-hover disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => editing.askClear(null)}
          className="rounded-md px-2 py-1 text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <button
        type="button"
        aria-label={`Clear ${label} record`}
        disabled={!record || saving}
        onClick={() => editing.askClear(key)}
        className={iconButtonClass}
      >
        <AppIcon name="trash" className="h-4 w-4" />
        <HoverDetail label="Clear record" />
      </button>
    </div>
  )
}
