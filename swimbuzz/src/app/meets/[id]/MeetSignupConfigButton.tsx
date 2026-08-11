"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { MeetFormCustomQuestionsEditor } from "@/components/MeetFormCustomQuestions"
import type { MeetSignupQuestion } from "@/lib/meet-signup"
import {
  findIncompleteChoiceQuestion,
  normalizeMeetSignupQuestions,
} from "@/lib/meet-signup"

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export type MeetSignupConfigInitial = {
  instructions: string
  minEvents: number | null
  maxEvents: number | null
  maxRelayEvents: number | null
  askNotes: boolean
  customQuestions: MeetSignupQuestion[]
  openAt: string | null
  closeAt: string | null
  withdrawUntil: string | null
}

export default function MeetSignupConfigButton({
  meetId,
  initial,
  eventCount,
}: {
  meetId: string
  initial: MeetSignupConfigInitial | null
  eventCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    instructions: initial?.instructions ?? "",
    minEvents: initial?.minEvents?.toString() ?? "",
    maxEvents: initial?.maxEvents?.toString() ?? "",
    maxRelayEvents: initial?.maxRelayEvents?.toString() ?? "",
    askNotes: initial?.askNotes ?? true,
    customQuestions: initial?.customQuestions ?? [],
    openAt: toDatetimeLocal(initial?.openAt ?? null),
    closeAt: toDatetimeLocal(initial?.closeAt ?? null),
    withdrawUntil: toDatetimeLocal(initial?.withdrawUntil ?? null),
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm({
      instructions: initial?.instructions ?? "",
      minEvents: initial?.minEvents?.toString() ?? "",
      maxEvents: initial?.maxEvents?.toString() ?? "",
      maxRelayEvents: initial?.maxRelayEvents?.toString() ?? "",
      askNotes: initial?.askNotes ?? true,
      customQuestions: initial?.customQuestions ?? [],
      openAt: toDatetimeLocal(initial?.openAt ?? null),
      closeAt: toDatetimeLocal(initial?.closeAt ?? null),
      withdrawUntil: toDatetimeLocal(initial?.withdrawUntil ?? null),
    })
  }, [open, initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const incompleteChoice = findIncompleteChoiceQuestion(form.customQuestions)
    if (incompleteChoice) {
      setError(`"${incompleteChoice.label}" needs at least 2 choices`)
      return
    }

    const openAt = fromDatetimeLocal(form.openAt)
    const closeAt = fromDatetimeLocal(form.closeAt)
    if (openAt && closeAt && new Date(openAt) > new Date(closeAt)) {
      setError("Close time must be on or after the open time")
      return
    }

    if (eventCount === 0) {
      setError("Must have an order of events to set up a sign-up form.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/signup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: form.instructions,
          minEvents: form.minEvents.trim() === "" ? null : form.minEvents,
          maxEvents: form.maxEvents.trim() === "" ? null : form.maxEvents,
          maxRelayEvents: form.maxRelayEvents.trim() === "" ? null : form.maxRelayEvents,
          askNotes: form.askNotes,
          customQuestions: form.customQuestions,
          openAt: fromDatetimeLocal(form.openAt),
          closeAt: fromDatetimeLocal(form.closeAt),
          withdrawUntil: fromDatetimeLocal(form.withdrawUntil),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save sign-up form")
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
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-border rounded-md bg-background hover:bg-fill transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 shrink-0"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {initial ? "Edit Form" : "Set Up Form"}
      </button>

      <Modal
        open={open}
        onClose={() => !loading && setOpen(false)}
        title="Meet Sign-up Form"
        description=""
        maxWidth="3xl"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="bg-background hover:bg-fill flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="meet-signup-config"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <form id="meet-signup-config" onSubmit={handleSubmit} className="space-y-5">
          <p className="text-sm text-foreground-secondary">
            {eventCount > 0
              ? `Swimmers can choose from the ${eventCount} events in this meet’s order of events.`
              : "No order of events yet — import the meet packet so swimmers have events to choose from."}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Opens
              </label>
              <input
                type="datetime-local"
                value={form.openAt}
                onChange={(e) => setForm((f) => ({ ...f, openAt: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Closes
              </label>
              <input
                type="datetime-local"
                value={form.closeAt}
                onChange={(e) => setForm((f) => ({ ...f, closeAt: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Drop by
              </label>
              <input
                type="datetime-local"
                value={form.withdrawUntil}
                onChange={(e) => setForm((f) => ({ ...f, withdrawUntil: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
              <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500">
                Defaults to close time
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Instructions
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={3}
              placeholder=""
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Min Individual Events{" "}
              </label>
              <input
                type="number"
                min={1}
                value={form.minEvents}
                onChange={(e) => setForm((f) => ({ ...f, minEvents: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Max Individual Events{" "}
              </label>
              <input
                type="number"
                min={1}
                value={form.maxEvents}
                onChange={(e) => setForm((f) => ({ ...f, maxEvents: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Max Relay Events{" "}
              </label>
              <input
                type="number"
                min={1}
                value={form.maxRelayEvents}
                onChange={(e) => setForm((f) => ({ ...f, maxRelayEvents: e.target.value }))}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.askNotes}
              onChange={(e) => setForm((f) => ({ ...f, askNotes: e.target.checked }))}
              className="rounded border-gray-300"
            />
            Include a notes field
          </label>

          <MeetFormCustomQuestionsEditor
            questions={form.customQuestions}
            onChange={(customQuestions) =>
              setForm((f) => ({
                ...f,
                customQuestions: normalizeMeetSignupQuestions(customQuestions),
              }))
            }
          />

          {error && <p className="text-sm text-error">{error}</p>}
        </form>
      </Modal>
    </>
  )
}
