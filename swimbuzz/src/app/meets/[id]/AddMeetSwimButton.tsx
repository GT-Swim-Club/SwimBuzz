"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { parseTime } from "@/lib/utils"
import Modal, { ModalFooter } from "@/components/Modal"

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
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    athleteId: "",
    event: "50 Free",
    time: "",
    course: defaultCourse,
    date: defaultDate,
  })

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.athleteId || !form.time) return

    const timeMs = Math.round(parseTime(form.time))
    if (!Number.isFinite(timeMs) || timeMs <= 0) {
      setError("Invalid time format")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/swims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId: form.athleteId,
          event: form.event,
          course: form.course,
          date: form.date,
          meet: meetName,
          meetId,
          timeMs,
          source: "manual",
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save swim")
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={athletes.length === 0}
        className="text-xs px-3 py-1.5 border border-border rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
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
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border"
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
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Athlete <span className="text-red-500">*</span>
          </label>
          <select
            required
            value={form.athleteId}
            onChange={(e) => setForm((f) => ({ ...f, athleteId: e.target.value }))}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
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
            <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
              Event
            </label>
            <select
              value={form.event}
              onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
            >
              {EVENTS.map((event) => (
                <option key={event}>{event}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
              Course
            </label>
            <select
              value={form.course}
              onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
            >
              <option>SCY</option>
              <option>LCM</option>
              <option>SCM</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
              Time <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              placeholder="1:23.45 or 58.32"
              value={form.time}
              onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background border-border"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-error dark:text-error">{error}</p>
        )}
      </Modal>
    </>
  )
}
