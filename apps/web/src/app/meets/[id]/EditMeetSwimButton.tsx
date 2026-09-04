"use client"

import { useState, useTransition } from "react"
import { formatTime, parseTime } from "@/lib/utils"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { DatePicker } from "@/components/ui/CustomDateTimePicker"
import ActionIcon from "@/components/ui/ActionIcon"
import { deleteMeetSwim, editMeetSwim } from "./EditMeetSwimButton.actions"

const EVENTS = [
  "50 Free",
  "100 Free",
  "200 Free",
  "400 Free",
  "500 Free",
  "1000 Free",
  "1650 Free",
  "100 Back",
  "200 Back",
  "100 Breast",
  "200 Breast",
  "100 Fly",
  "200 Fly",
  "200 IM",
  "400 IM",
]

type AthleteOption = { id: string; name: string }

type EditMeetSwimButtonProps = {
  swimId: string
  meetId: string
  meetName: string
  athletes: AthleteOption[]
  athleteId: string
  event: string
  course: string
  date: string
  timeMs: number
  className?: string
}

export default function EditMeetSwimButton({
  swimId,
  meetId,
  meetName,
  athletes,
  athleteId,
  event,
  course,
  date,
  timeMs,
  className,
}: EditMeetSwimButtonProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    athleteId,
    event,
    time: formatTime(timeMs),
    course,
    date,
  })
  const loading = isPending

  function openModal() {
    setForm({
      athleteId,
      event,
      time: formatTime(timeMs),
      course,
      date,
    })
    setError(null)
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.athleteId || !form.time) return

    const nextTimeMs = Math.round(parseTime(form.time))
    if (!Number.isFinite(nextTimeMs) || nextTimeMs <= 0) {
      setError("Invalid time format")
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await editMeetSwim(swimId, {
          athleteId: form.athleteId,
          event: form.event,
          course: form.course,
          date: form.date,
          meet: meetName,
          meetId,
          timeMs: nextTimeMs,
        })
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save swim")
      }
    })
  }

  function handleDelete() {
    if (!confirm("Delete this swim?")) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteMeetSwim(swimId)
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete swim")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
          className={
          className ??
          "p-1 rounded text-foreground-tertiary hover:text-foreground hover:bg-fill disabled:opacity-50 transition-colors"
        }
        aria-label="Edit swim"
      >
        <ActionIcon kind="edit" className="w-4 h-4" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Edit swim"
        description={meetName}
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="bg-background rounded-lg border border-border border-red-200 px-4 py-2.5 text-sm font-medium text-error hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.time}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save swim"}
            </button>
          </ModalFooter>
        }
      >
        <div>
          <label className="block text-xs font-medium text-foreground-secondary mb-1">
            Athlete <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={form.athleteId}
            onChange={(e) => setForm((f) => ({ ...f, athleteId: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
          >
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Event
            </label>
            <select
              value={form.event}
              onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            >
              {EVENTS.map((ev) => (
                <option key={ev}>{ev}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Course
            </label>
            <select
              value={form.course}
              onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            >
              <option>SCY</option>
              <option>LCM</option>
              <option>SCM</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Time <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              placeholder="1:23.45 or 58.32"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <DatePicker
              value={form.date}
              onChange={(value) => setForm((form) => ({ ...form, date: value }))}
              ariaLabel="Date"
              required
              clearable
            />
          </div>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
      </Modal>
    </>
  )
}
