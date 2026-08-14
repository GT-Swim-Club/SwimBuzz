"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { DatePicker, TimePicker } from "@/components/CustomDateTimePicker"
import { MeetFormCustomQuestionsEditor } from "@/components/MeetFormCustomQuestions"
import {
  findIncompleteChoiceQuestion,
  normalizeMeetSignupQuestions,
  type MeetSignupQuestion,
} from "@/lib/meet-signup"

function toDatePart(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toTimePart(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDateTimeParts(date: string, time: string): string | null {
  const datePart = date.trim()
  const timePart = time.trim()
  if (!datePart || !timePart) return null
  const d = new Date(`${datePart}T${timePart}`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export type MeetRoomConfigInitial = {
  instructions: string
  maxPreferences: number
  openAt: string | null
  closeAt: string | null
  customQuestions: MeetSignupQuestion[]
}

export default function MeetRoomConfigButton({
  meetId,
  initial,
  inline = false,
}: {
  meetId: string
  initial: MeetRoomConfigInitial | null
  inline?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(inline)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    instructions: initial?.instructions ?? "",
    maxPreferences: initial?.maxPreferences?.toString() ?? "3",
    openDate: toDatePart(initial?.openAt ?? null),
    openTime: toTimePart(initial?.openAt ?? null),
    closeDate: toDatePart(initial?.closeAt ?? null),
    closeTime: toTimePart(initial?.closeAt ?? null),
    customQuestions: initial?.customQuestions ?? [],
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm({
      instructions: initial?.instructions ?? "",
      maxPreferences: initial?.maxPreferences?.toString() ?? "3",
      openDate: toDatePart(initial?.openAt ?? null),
      openTime: toTimePart(initial?.openAt ?? null),
      closeDate: toDatePart(initial?.closeAt ?? null),
      closeTime: toTimePart(initial?.closeAt ?? null),
      customQuestions: initial?.customQuestions ?? [],
    })
  }, [open, initial])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const openAt = fromDateTimeParts(form.openDate, form.openTime)
    const closeAt = fromDateTimeParts(form.closeDate, form.closeTime)
    if (openAt && closeAt && new Date(openAt) > new Date(closeAt)) {
      setError("Close time must be on or after the open time")
      return
    }

    const maxPreferences = parseInt(form.maxPreferences, 10)
    if (!Number.isFinite(maxPreferences) || maxPreferences < 1 || maxPreferences > 10) {
      setError("Max preferences must be between 1 and 10")
      return
    }

    const incompleteChoice = findIncompleteChoiceQuestion(form.customQuestions)
    if (incompleteChoice) {
      setError(`"${incompleteChoice.label}" needs at least 2 choices`)
      return
    }

    setLoading(true)
    setError(null)
    try {
      if (!initial) {
        const createRes = await fetch(`/api/meets/${meetId}/rooms`, { method: "POST" })
        if (!createRes.ok) {
          const data = await createRes.json()
          setError(data.error ?? "Failed to create form")
          return
        }
      }

      const res = await fetch(`/api/meets/${meetId}/rooms`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: form.instructions,
          maxPreferences,
          openAt: fromDateTimeParts(form.openDate, form.openTime),
          closeAt: fromDateTimeParts(form.closeDate, form.closeTime),
          customQuestions: form.customQuestions,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save")
        return
      }
      if (!inline) setOpen(false)
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
        hidden={inline}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-border rounded-md hover:bg-fill transition-colors"
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
        presentation={inline ? "inline" : "dialog"}
        portal={!inline}
        panelClassName={inline ? "w-full max-w-none max-h-none overflow-visible shadow-sm" : ""}
        open={open}
        onClose={() => !loading && !inline && setOpen(false)}
        title={inline ? (initial ? "Roommate preference settings" : "Set up roommate preferences") : "Roommate Preference Form"}
        description=""
        maxWidth="2xl"
        footer={
          <ModalFooter>
            <button
              type="button"
              hidden={inline}
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="meet-room-config"
              disabled={loading}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : "Save"}
            </button>
          </ModalFooter>
        }
      >
        <form id="meet-room-config" onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Opens
              </label>
              <div className="space-y-2">
                <DatePicker
                  value={form.openDate}
                  onChange={(value) => setForm((form) => ({
                    ...form,
                    openDate: value,
                    openTime: value ? form.openTime || "00:00" : "",
                  }))}
                  placeholder="Date"
                  ariaLabel="Opening date"
                  clearable
                />
                <TimePicker
                  key={form.openDate}
                  value={form.openTime}
                  onChange={(value) => setForm((form) => ({
                    ...form,
                    openDate: value ? form.openDate : "",
                    openTime: value,
                  }))}
                  placeholder="Time"
                  ariaLabel="Opening time"
                  disabled={!form.openDate}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Closes
              </label>
              <div className="space-y-2">
                <DatePicker
                  value={form.closeDate}
                  onChange={(value) => setForm((form) => ({
                    ...form,
                    closeDate: value,
                    closeTime: value ? form.closeTime || "00:00" : "",
                  }))}
                  placeholder="Date"
                  ariaLabel="Closing date"
                  clearable
                />
                <TimePicker
                  key={form.closeDate}
                  value={form.closeTime}
                  onChange={(value) => setForm((form) => ({
                    ...form,
                    closeDate: value ? form.closeDate : "",
                    closeTime: value,
                  }))}
                  placeholder="Time"
                  ariaLabel="Closing time"
                  disabled={!form.closeDate}
                />
              </div>
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
              placeholder="Any notes for swimmers about roommate preferences…"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Max preferences per athlete
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.maxPreferences}
              onChange={(e) => setForm((f) => ({ ...f, maxPreferences: e.target.value }))}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
            />
          </div>

          <MeetFormCustomQuestionsEditor
            questions={form.customQuestions}
            onChange={(customQuestions) =>
              setForm((f) => ({ ...f, customQuestions: normalizeMeetSignupQuestions(customQuestions) }))
            }
          />

          {error && <p className="text-sm text-error">{error}</p>}
        </form>
      </Modal>
    </>
  )
}
