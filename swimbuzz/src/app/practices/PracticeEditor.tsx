"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { SET_TAGS } from "@/lib/practice-tags"
import RichTextField from "@/components/RichTextField"

export type SetFormState = {
  id?: string
  title: string
  content: string
  notes: string
  tags: string[]
  distance: string
}

export type PracticeFormState = {
  title: string
  date: string
  focus: string
  published?: boolean
  sets: SetFormState[]
}

export const emptySet: SetFormState = {
  title: "",
  content: "",
  notes: "",
  tags: [],
  distance: "",
}

export const emptyPractice: PracticeFormState = {
  title: "",
  date: "",
  focus: "",
  sets: [{ ...emptySet }],
}

const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
const labelCls = "block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1"

export default function PracticeEditor({
  practiceId,
  initial,
  triggerLabel = "New practice",
  triggerClassName = "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors",
}: {
  practiceId?: string
  initial?: PracticeFormState
  triggerLabel?: string
  triggerClassName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<PracticeFormState>(initial ?? emptyPractice)

  function openModal() {
    setForm(initial ?? emptyPractice)
    setError(null)
    setOpen(true)
  }

  function updateSet(index: number, patch: Partial<SetFormState>) {
    setForm((f) => ({
      ...f,
      sets: f.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }))
  }

  function toggleTag(index: number, tag: string) {
    setForm((f) => ({
      ...f,
      sets: f.sets.map((s, i) => {
        if (i !== index) return s
        const has = s.tags.includes(tag)
        return { ...s, tags: has ? s.tags.filter((t) => t !== tag) : [...s.tags, tag] }
      }),
    }))
  }

  function addCustomTag(index: number, raw: string) {
    const tag = raw.trim()
    if (!tag) return
    setForm((f) => ({
      ...f,
      sets: f.sets.map((s, i) => {
        if (i !== index) return s
        if (s.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return s
        return { ...s, tags: [...s.tags, tag] }
      }),
    }))
  }

  function addSet() {
    setForm((f) => ({ ...f, sets: [...f.sets, { ...emptySet }] }))
  }

  function removeSet(index: number) {
    setForm((f) => ({ ...f, sets: f.sets.filter((_, i) => i !== index) }))
  }

  function moveSet(index: number, dir: -1 | 1) {
    setForm((f) => {
      const next = [...f.sets]
      const j = index + dir
      if (j < 0 || j >= next.length) return f
      ;[next[index], next[j]] = [next[j], next[index]]
      return { ...f, sets: next }
    })
  }

  async function save(published: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(practiceId ? `/api/practices/${practiceId}` : "/api/practices", {
        method: practiceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, published }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save practice")
        return
      }
      setOpen(false)
      if (practiceId) {
        router.refresh()
      } else {
        router.push(`/practices/${data.id}`)
        router.refresh()
      }
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await save(false)
  }

  return (
    <>
      <button type="button" onClick={openModal} className={triggerClassName}>
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
            aria-label="Close dialog"
          />
          <div
            className="relative z-10 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="shrink-0 text-lg font-medium text-gray-900 dark:text-zinc-100 px-6 pt-6 pb-4">
              {practiceId ? "Edit practice" : "New practice"}
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
              <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Title</label>
                  <input
                    required
                    placeholder="e.g. Thursday AM — Threshold"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Focus / notes (optional)</label>
                <RichTextField
                  rows={2}
                  value={form.focus}
                  onChange={(focus) => setForm((f) => ({ ...f, focus }))}
                  className={`${inputCls} min-h-[3rem]`}
                />
              </div>

              {/* Sets */}
              <div className="space-y-4">
                {form.sets.map((set, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-gray-200 dark:border-zinc-700 p-4 space-y-3 bg-gray-50/50 dark:bg-zinc-950/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">
                        Set {i + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveSet(i, -1)}
                          disabled={i === 0}
                          className="px-1.5 py-0.5 text-xs rounded border dark:border-zinc-700 disabled:opacity-30"
                          aria-label="Move set up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSet(i, 1)}
                          disabled={i === form.sets.length - 1}
                          className="px-1.5 py-0.5 text-xs rounded border dark:border-zinc-700 disabled:opacity-30"
                          aria-label="Move set down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSet(i)}
                          disabled={form.sets.length === 1}
                          className="px-2 py-0.5 text-xs rounded border border-red-200 text-red-600 dark:border-red-900/50 dark:text-red-400 disabled:opacity-30"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Set name (optional)</label>
                        <input
                          placeholder="e.g. Main set"
                          value={set.title}
                          onChange={(e) => updateSet(i, { title: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Distance (optional)</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="yds/m"
                          value={set.distance}
                          onChange={(e) => updateSet(i, { distance: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Workout</label>
                      <RichTextField
                        required
                        rows={4}
                        value={set.content}
                        onChange={(content) => updateSet(i, { content })}
                        className={`${inputCls} min-h-[6rem]`}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Coach notes (optional)</label>
                      <RichTextField
                        rows={2}
                        value={set.notes}
                        onChange={(notes) => updateSet(i, { notes })}
                        className={`${inputCls} min-h-[3rem]`}
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Set type tags</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SET_TAGS.map((tag) => {
                          const active = set.tags.includes(tag)
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(i, tag)}
                              className={
                                "text-xs px-2 py-0.5 rounded-full border transition-colors " +
                                (active
                                  ? "bg-indigo-600 border-indigo-600 text-white"
                                  : "border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800")
                              }
                            >
                              {tag}
                            </button>
                          )
                        })}
                        {set.tags
                          .filter((t) => !SET_TAGS.includes(t as (typeof SET_TAGS)[number]))
                          .map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(i, tag)}
                              className="text-xs px-2 py-0.5 rounded-full border bg-indigo-600 border-indigo-600 text-white"
                            >
                              {tag} ✕
                            </button>
                          ))}
                      </div>
                      <input
                        placeholder="Add custom tag + Enter"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            addCustomTag(i, e.currentTarget.value)
                            e.currentTarget.value = ""
                          }
                        }}
                        className={`${inputCls} mt-2`}
                      />
                    </div>
                  </div>
                ))}
              </div>

                <button
                  type="button"
                  onClick={addSet}
                  className="w-full rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 px-4 py-2.5 text-sm text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  + Add set
                </button>
              </div>

              <div className="shrink-0 border-t border-gray-200 dark:border-zinc-700 px-6 py-4 space-y-3">
                {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={loading}
                    className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => save(false)}
                    disabled={loading}
                    className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
                  >
                    {loading ? "Saving…" : "Save draft"}
                  </button>
                  <button
                    type="button"
                    onClick={() => save(true)}
                    disabled={loading}
                    className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loading ? "Saving…" : "Publish"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
