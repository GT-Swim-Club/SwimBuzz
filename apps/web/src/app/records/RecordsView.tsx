"use client"

import { useRef, useState } from "react"
import { createApiClient } from "@swimbuzz/api"
import {
  parseRecordTime,
  type RecordEventDef,
  type RecordGender,
  type TeamRecordsResponse,
} from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard"
import {
  draftFromRecord,
  recordKey,
  RecordsEditingContext,
  sameDraft,
  type RecordDraft,
  type RecordsEditing,
} from "./RecordCells"
import RecordsTable from "./RecordsTable"
import RecordsList from "./RecordsList"
import RecordHistoryModal from "./RecordHistoryModal"
import ShareRecordsButton from "./ShareRecordsButton"

const api = createApiClient({})

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map
  const next = { ...map }
  delete next[key]
  return next
}

/**
 * The records page: the club's records sheet (Women's · Event · Men's) on wide screens, one gender
 * at a time on phones. Staff switch on "Edit records" to type into the table; each record saves when
 * focus leaves it.
 */
export default function RecordsView({
  initial,
  canEdit,
  athleteNames,
}: {
  initial: TeamRecordsResponse
  canEdit: boolean
  athleteNames: string[]
}) {
  const [data, setData] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, RecordDraft>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmingClear, setConfirmingClear] = useState<string | null>(null)
  const [history, setHistory] = useState<{ def: RecordEventDef; gender: RecordGender } | null>(null)
  const [gender, setGender] = useState<"F" | "M">("F")
  // Enter saves and the blur that follows would too; one request per record at a time.
  const inFlight = useRef(new Set<string>())

  const anySaving = Object.values(saving).some(Boolean)
  useUnsavedChangesGuard(editing && (Object.keys(drafts).length > 0 || anySaving))

  // "Done" waits for the save its own click's blur started; a record that failed to save keeps editing open.
  if (leaving && !anySaving) {
    setLeaving(false)
    if (Object.keys(drafts).length === 0) {
      setEditing(false)
      setConfirmingClear(null)
    }
  }

  const value: RecordsEditing = {
    editing,
    drafts,
    saving,
    errors,
    confirmingClear,
    setDraft(key, def, record, patch) {
      setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? draftFromRecord(def, record)), ...patch } }))
    },
    commit(def, recordGender, record) {
      const key = recordKey(recordGender, def.event)
      const draft = drafts[key]
      if (!draft || inFlight.current.has(key)) return
      const empty = !draft.time.trim() && !draft.year.trim() && draft.names.every((n) => !n.trim())
      if (sameDraft(draft, draftFromRecord(def, record)) || (!record && empty)) {
        setDrafts((prev) => without(prev, key))
        setErrors((prev) => without(prev, key))
        return
      }
      const fail = (message: string) => setErrors((prev) => ({ ...prev, [key]: message }))
      if (!parseRecordTime(draft.time)) return fail("Enter a time like 1:38.65 or 22.29")
      if (!/^\d{4}$/.test(draft.year.trim())) return fail("Enter the year")
      if (!def.relay && !draft.names[0]?.trim()) return fail("Enter the swimmer's name")

      // Same year keeps the record's date; a new year makes it year-only.
      const date = record?.date && draft.year.trim() === String(record.year) ? record.date.slice(0, 10) : null
      inFlight.current.add(key)
      setSaving((prev) => ({ ...prev, [key]: true }))
      api
        .updateRecord({
          gender: recordGender,
          event: def.event,
          time: draft.time.trim(),
          year: Number(draft.year),
          date,
          swimmers: draft.names.map((name) => ({ name: name.trim() })),
          leadoff: draft.leadoff,
          meetName: date ? record?.meetName : null,
        })
        .then((next) => {
          setData(next)
          setDrafts((prev) => without(prev, key))
          setErrors((prev) => without(prev, key))
        })
        .catch((err: unknown) => fail(err instanceof Error ? err.message : "Couldn't save the record"))
        .finally(() => {
          inFlight.current.delete(key)
          setSaving((prev) => without(prev, key))
        })
    },
    revert(key) {
      setDrafts((prev) => without(prev, key))
      setErrors((prev) => without(prev, key))
    },
    askClear: setConfirmingClear,
    clear(def, recordGender) {
      const key = recordKey(recordGender, def.event)
      setSaving((prev) => ({ ...prev, [key]: true }))
      api
        .clearRecord(recordGender, def.event)
        .then((next) => {
          setData(next)
          setDrafts((prev) => without(prev, key))
          setErrors((prev) => without(prev, key))
        })
        .catch((err: unknown) =>
          setErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : "Couldn't clear the record" }))
        )
        .finally(() => {
          setConfirmingClear(null)
          setSaving((prev) => without(prev, key))
        })
    },
    openHistory: (def, recordGender) => setHistory({ def, gender: recordGender }),
  }

  // Staff toggle in the table's top-right corner: a pencil, then a check to finish.
  const editButton = canEdit ? (
    <button
      type="button"
      aria-label={editing ? "Done editing" : "Edit records"}
      aria-pressed={editing}
      onClick={() => (editing ? setLeaving(true) : setEditing(true))}
      className={`group relative inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors ${
        editing
          ? "bg-primary text-primary-contrast hover:bg-primary-hover"
          : "text-foreground-secondary hover:bg-fill-secondary hover:text-primary"
      }`}
    >
      <AppIcon name={editing ? "check" : "pencil"} className="h-4 w-4" />
      <HoverDetail label={editing ? "Done editing" : "Edit records"} />
    </button>
  ) : null
  // Share beside it; hidden while editing, since the export shows saved records only.
  const actions = (
    <>
      {editing ? null : <ShareRecordsButton rows={data.rows} />}
      {editButton}
    </>
  )

  return (
    <RecordsEditingContext.Provider value={value}>
      <RecordsTable rows={data.rows} action={actions} />
      <RecordsList rows={data.rows} gender={gender} onGenderChange={setGender} action={actions} />

      {editing ? (
        <datalist id="record-athletes">
          {athleteNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}

      {history ? (
        <RecordHistoryModal
          def={history.def}
          gender={history.gender}
          canEdit={canEdit}
          onClose={() => setHistory(null)}
          onChanged={() => api.getRecords().then(setData).catch(() => {})}
        />
      ) : null}
    </RecordsEditingContext.Provider>
  )
}
