"use client"

import { useState, useTransition } from "react"
import { parseTime } from "@/lib/utils"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { DatePicker } from "@/components/ui/CustomDateTimePicker"
import { addMeetSwim } from "./AddMeetSwimButton.actions"

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

export default function AddMeetSwimButton({
  meetId,
  meetName,
  defaultCourse,
  defaultDate,
  athletes,
}: {
  meetId: string
  meetName: string
  defaultCourse: string
  defaultDate: string
  athletes: AthleteOption[]
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    athleteId: "",
    event: "50 Free",
    time: "",
    course: defaultCourse,
    date: defaultDate,
  })
  const loading = isPending

  function openModal() {
    setForm({
      athleteId: athletes[0]?.id ?? "",
      event: "50 Free",
      time: "",
      course: defaultCourse,
      date: defaultDate,
    })
    setError(null)
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.athleteId || !form.time) return

    const timeMs = Math.round(parseTime(form.time))
    if (!Number.isFinite(timeMs) || timeMs <= 0) {
      setError("Invalid time format")
      return
    }

    setError(null)
    startTransition(async () => {
      try {
        await addMeetSwim({
          athleteId: form.athleteId,
          event: form.event,
          course: form.course,
          date: form.date,
          meet: meetName,
          meetId,
          timeMs,
        })
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save swim")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={athletes.length === 0}
        className="text-xs px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill disabled:opacity-40 transition-colors"
      >
        Add swim
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Add swim"
        description={meetName}
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
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
              {EVENTS.map((event) => (
                <option key={event}>{event}</option>
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

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}
      </Modal>
    </>
  )
}
