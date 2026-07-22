"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import type { MeetSignupQuestion, MeetSignupQuestionType } from "@/lib/meet-signup"

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
  enabled: boolean
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
  const [questionDraft, setQuestionDraft] = useState("")
  const [questionType, setQuestionType] = useState<MeetSignupQuestionType>("text")
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    enabled: initial?.enabled ?? false,
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
    setQuestionDraft("")
    setQuestionType("text")
    setOptionDrafts({})
    setForm({
      enabled: initial?.enabled ?? false,
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

  function addQuestion() {
    const label = questionDraft.trim()
    if (!label) return
    const id = `q_${Date.now().toString(36)}`
    setForm((f) => ({
      ...f,
      customQuestions: [
        ...f.customQuestions,
        {
          id,
          label,
          required: false,
          type: questionType,
          options: questionType === "choice" ? ["Yes", "No"] : [],
        },
      ],
    }))
    setQuestionDraft("")
    setQuestionType("text")
  }

  function addOption(questionId: string) {
    const draft = (optionDrafts[questionId] ?? "").trim()
    if (!draft) return
    setForm((f) => ({
      ...f,
      customQuestions: f.customQuestions.map((item) => {
        if (item.id !== questionId) return item
        if (item.options.includes(draft)) return item
        return { ...item, options: [...item.options, draft] }
      }),
    }))
    setOptionDrafts((d) => ({ ...d, [questionId]: "" }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const incompleteChoice = form.customQuestions.find(
      (q) => q.type === "choice" && q.options.length < 2
    )
    if (incompleteChoice) {
      setError(`"${incompleteChoice.label}" needs at least 2 choices`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/signup`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
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
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-border border-border-secondary border-border-secondary-secondary-secondary rounded-md dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:bg-background-elevated transition-colors"
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
              className="bg-background flex-1 rounded-lg border border-border border-border-secondary px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border-secondary-secondary"
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              className="rounded border-gray-300"
            />
            Accepting sign-ups
          </label>

          <p className="text-sm text-foreground-secondary text-foreground-secondary">
            {eventCount > 0
              ? `Swimmers can choose from the ${eventCount} events in this meet’s order of events.`
              : "No order of events yet — import the meet packet so swimmers have events to choose from."}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                Opens
              </label>
              <input
                type="datetime-local"
                value={form.openAt}
                onChange={(e) => setForm((f) => ({ ...f, openAt: e.target.value }))}
                className="w-full rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                Closes
              </label>
              <input
                type="datetime-local"
                value={form.closeAt}
                onChange={(e) => setForm((f) => ({ ...f, closeAt: e.target.value }))}
                className="w-full rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                Withdraw by
              </label>
              <input
                type="datetime-local"
                value={form.withdrawUntil}
                onChange={(e) => setForm((f) => ({ ...f, withdrawUntil: e.target.value }))}
                className="w-full rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
              />
              <p className="mt-1 text-[11px] text-gray-400 dark:text-zinc-500">
                Defaults to close time
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
              Instructions
            </label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={3}
              placeholder=""
              className="w-full rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                Min Individual Events{" "}
              </label>
              <input
                type="number"
                min={1}
                value={form.minEvents}
                onChange={(e) => setForm((f) => ({ ...f, minEvents: e.target.value }))}
                className="w-full rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                Max Individual Events{" "}
              </label>
              <input
                type="number"
                min={1}
                value={form.maxEvents}
                onChange={(e) => setForm((f) => ({ ...f, maxEvents: e.target.value }))}
                className="w-full rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
                Max Relay Events{" "}
              </label>
              <input
                type="number"
                min={1}
                value={form.maxRelayEvents}
                onChange={(e) => setForm((f) => ({ ...f, maxRelayEvents: e.target.value }))}
                className="w-full rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
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

          <div>
            <label className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
              Custom questions
            </label>
            {form.customQuestions.length > 0 && (
              <div className="space-y-3 mb-3">
                {form.customQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="bg-background rounded-lg border border-border border-border-secondary px-3 py-2 space-y-2 border-border-secondary-secondary"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{q.label}</p>
                        <p className="text-xs text-gray-400">
                          {q.type === "choice" ? "Multiple choice" : "Short text"}
                        </p>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-foreground-secondary shrink-0">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              customQuestions: f.customQuestions.map((item) =>
                                item.id === q.id
                                  ? { ...item, required: e.target.checked }
                                  : item
                              ),
                            }))
                          }
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!confirm(`Remove custom question “${q.label}”?`)) return
                          setForm((f) => ({
                            ...f,
                            customQuestions: f.customQuestions.filter((item) => item.id !== q.id),
                          }))
                        }}
                        className="text-xs text-error dark:text-error shrink-0"
                      >
                        Remove
                      </button>
                    </div>

                    {q.type === "choice" && (
                      <div className="space-y-1.5 pl-0.5">
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map((opt) => (
                            <span
                              key={opt}
                              className="bg-background inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border border-border-secondary border-border-secondary-secondary"
                            >
                              {opt}
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`Remove “${opt}” from choices?`)) return
                  setForm((f) => ({
                    ...f,
                    customQuestions: f.customQuestions.map((item) =>
                      item.id === q.id
                        ? {
                            ...item,
                            options: item.options.filter((o) => o !== opt),
                          }
                        : item
                    ),
                  }))
                }}
                className="text-foreground-tertiary hover:text-red-500"
                aria-label={`Remove ${opt}`}
              >
                ×
              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={optionDrafts[q.id] ?? ""}
                            onChange={(e) =>
                              setOptionDrafts((d) => ({ ...d, [q.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                addOption(q.id)
                              }
                            }}
                            placeholder="Add choice"
                            className="flex-1 rounded-lg border border-border border-border-secondary px-2 py-1.5 text-xs bg-background border-border-secondary-secondary"
                          />
                          <button
                            type="button"
                            onClick={() => addOption(q.id)}
                            disabled={!(optionDrafts[q.id] ?? "").trim()}
                            className="bg-background text-xs px-2 py-1.5 border border-border border-border-secondary rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary disabled:opacity-40"
                          >
                            Add
                          </button>
                        </div>
                        {q.options.length < 2 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Add at least 2 choices
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={questionDraft}
                onChange={(e) => setQuestionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addQuestion()
                  }
                }}
                placeholder="Add question + Enter"
                className="flex-1 min-w-[10rem] rounded-lg border border-border border-border-secondary px-3 py-2 text-sm bg-background border-border-secondary-secondary"
              />
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as MeetSignupQuestionType)}
                className="rounded-lg border border-border border-border-secondary px-2 py-2 text-sm bg-background border-border-secondary-secondary"
              >
                <option value="text">Short text</option>
                <option value="choice">Multiple choice</option>
              </select>
              <button
                type="button"
                onClick={addQuestion}
                disabled={!questionDraft.trim()}
                className="bg-background text-sm px-3 py-2 border border-border border-border-secondary rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-error dark:text-error">{error}</p>}
        </form>
      </Modal>
    </>
  )
}
