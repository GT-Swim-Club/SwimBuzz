"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"

const FALLBACK_EVENTS = [
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

type EditSheetSeedButtonProps = {
  meetId: string
  athleteId: string
  athleteName: string
  event: string
  seedTime?: string
  timeStatus?: string
  eventOptions?: string[]
  className?: string
}

export default function EditSheetSeedButton({
  meetId,
  athleteId,
  athleteName,
  event,
  seedTime,
  timeStatus,
  eventOptions,
  className,
}: EditSheetSeedButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialTime = seedTime?.trim() || (timeStatus?.toUpperCase() === "NT" ? "NT" : "")
  const [form, setForm] = useState({ event, time: initialTime || "NT" })

  const events =
    eventOptions && eventOptions.length > 0
      ? eventOptions
      : FALLBACK_EVENTS.includes(event)
        ? FALLBACK_EVENTS
        : [event, ...FALLBACK_EVENTS]

  function openModal() {
    setForm({
      event,
      time: seedTime?.trim() || (timeStatus?.toUpperCase() === "NT" ? "NT" : "NT"),
    })
    setError(null)
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.event || !form.time.trim()) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/sheet-entry`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          athleteId,
          event,
          newEvent: form.event,
          seedTime: form.time.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save entry")
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

  async function handleDelete() {
    if (!confirm(`Remove ${athleteName}'s ${event} from the roster summary?`)) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/sheet-entry`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteId, event }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to delete entry")
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
        className={
          className ??
          "p-1 rounded text-foreground-tertiary hover:text-foreground dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:text-foreground dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary disabled:opacity-50 transition-colors"
        }
        aria-label="Edit sign-up entry"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        title="Edit roster entry"
        description={athleteName}
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="rounded-lg border border-border border-border-secondary border-border-secondary-secondary-secondary px-4 py-2.5 text-sm font-medium text-error dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:text-error dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:border-red-900 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border border-border-secondary border-border-secondary-secondary-secondary px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border-secondary-secondary border-border-secondary-secondary-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !form.time.trim()}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Event
          </label>
          <select
            value={form.event}
            onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}
            className="w-full rounded-lg border border-border border-border-secondary border-border-secondary-secondary-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary border-border-secondary-secondary-secondary"
          >
            {!events.includes(form.event) ? <option value={form.event}>{form.event}</option> : null}
            {events.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
            Seed time <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            placeholder="1:23.45, 58.32, or NT"
            value={form.time}
            onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
            className="w-full rounded-lg border border-border border-border-secondary border-border-secondary-secondary-secondary px-3 py-2 text-sm font-mono bg-background border-border-secondary-secondary border-border-secondary-secondary-secondary"
          />
        </div>

        {error && <p className="text-sm text-error dark:text-error">{error}</p>}
      </Modal>
    </>
  )
}
