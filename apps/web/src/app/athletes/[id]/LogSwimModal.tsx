"use client"

import { useState, useTransition, type ReactNode } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { AppIcon } from "@/components/ui/AppIcon"
import { DatePicker } from "@/components/ui/CustomDateTimePicker"
import { COURSE_LABELS } from "@/lib/swim/swim-parse"
import { parseTime } from "@/lib/utils"
import { addAthleteSwim } from "./athlete.actions"

const EVENTS = [
  "50 Free", "100 Free", "200 Free", "400 Free", "500 Free", "1000 Free", "1650 Free",
  "50 Back", "100 Back", "200 Back",
  "50 Breast", "100 Breast", "200 Breast",
  "50 Fly", "100 Fly", "200 Fly",
  "100 IM", "200 IM", "400 IM",
]

const INPUT =
  "w-full rounded-lg border border-border-secondary bg-background px-3 py-2 text-sm text-foreground"

function Field({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground-secondary">
        {label}
      </label>
      {children}
    </div>
  )
}

function Select({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} appearance-none pr-9`}
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <AppIcon
        name="chevronDown"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-tertiary"
      />
    </div>
  )
}

export default function LogSwimModal({
  open,
  onClose,
  athleteId,
  defaultCourse,
}: {
  open: boolean
  onClose: () => void
  athleteId: string
  defaultCourse: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    event: "50 Free",
    course: defaultCourse,
    time: "",
    date: new Date().toLocaleDateString("en-CA"),
    meet: "",
  })
  const [prevOpen, setPrevOpen] = useState(open)

  // Each open starts on the course the sidebar is showing, with a blank time.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setForm((f) => ({ ...f, course: defaultCourse, time: "" }))
      setError(null)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.time) return
    const timeMs = Math.round(parseTime(form.time))
    if (!Number.isFinite(timeMs) || timeMs <= 0) {
      setError("Invalid time format")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await addAthleteSwim({
          athleteId,
          event: form.event,
          course: form.course,
          date: form.date,
          meet: form.meet,
          timeMs,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save swim")
      }
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={isPending}
      title="Log a swim"
      description="Manual swims can be deleted from the history later."
      maxWidth="md"
      onSubmit={handleSubmit}
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !form.time}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Log swim"}
          </button>
        </ModalFooter>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-3">
        <Field id="log-event" label="Event">
          <Select id="log-event" value={form.event} onChange={(event) => setForm((f) => ({ ...f, event }))} options={EVENTS} />
        </Field>
        <Field id="log-course" label="Course">
          <Select id="log-course" value={form.course} onChange={(course) => setForm((f) => ({ ...f, course }))} options={COURSE_LABELS} />
        </Field>
      </div>
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
        <Field id="log-time" label="Time">
          <input
            id="log-time"
            type="text"
            inputMode="decimal"
            placeholder="1:02.34"
            value={form.time}
            onChange={(e) => {
              setForm((f) => ({ ...f, time: e.target.value }))
              setError(null)
            }}
            className={`${INPUT} font-mono tabular-nums`}
          />
        </Field>
        <Field label="Date">
          <DatePicker
            value={form.date}
            onChange={(date) => setForm((f) => ({ ...f, date }))}
            ariaLabel="Date"
          />
        </Field>
      </div>
      <Field id="log-meet" label="Meet">
        <input
          id="log-meet"
          type="text"
          placeholder="Optional"
          value={form.meet}
          onChange={(e) => setForm((f) => ({ ...f, meet: e.target.value }))}
          className={INPUT}
        />
      </Field>
      {error && <p className="text-sm text-error">{error}</p>}
    </Modal>
  )
}
