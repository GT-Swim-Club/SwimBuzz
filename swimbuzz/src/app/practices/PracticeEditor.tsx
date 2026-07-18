"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SET_TAGS } from "@/lib/practice-tags"
import RichTextField from "@/components/RichTextField"
import { PRACTICE_EDIT_LOCK_HEARTBEAT_MS, PRACTICE_EDIT_LOCK_TOKEN_HEADER, type PracticeEditLockInfo } from "@/lib/practice-edit-lock-shared"
import { broadcastPracticeEditLockChanged } from "@/lib/practice-edit-lock-client"

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
  onCancel,
  holdEditLock = false,
  editLockToken = null,
  onLockLost,
}: {
  practiceId?: string
  initial?: PracticeFormState
  onCancel?: () => void
  /** When true, keep the exclusive edit lock alive and release on exit. */
  holdEditLock?: boolean
  /** Per-tab lock token from acquire — required when holdEditLock is true. */
  editLockToken?: string | null
  /** Fired when another session steals the lock; do not release afterward. */
  onLockLost?: (message: string, lock?: PracticeEditLockInfo | null) => void
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<PracticeFormState>(initial ?? emptyPractice)
  const releasedRef = useRef(false)
  const lostRef = useRef(false)
  const tokenRef = useRef(editLockToken)
  tokenRef.current = editLockToken
  const onLockLostRef = useRef(onLockLost)
  onLockLostRef.current = onLockLost

  function lockHeaders(extra?: HeadersInit): HeadersInit {
    const token = tokenRef.current
    return {
      ...(extra ?? {}),
      ...(token ? { [PRACTICE_EDIT_LOCK_TOKEN_HEADER]: token } : {}),
    }
  }

  function takeoverMessage(data: {
    error?: string
    lock?: PracticeEditLockInfo | null
  }): string {
    const lock = data.lock
    if (lock?.lockedByMe) {
      return "Another one of your tabs took over editing this practice. Your unsaved changes were not saved."
    }
    const name = lock?.lockedBy?.name?.trim()
    if (name) {
      return `${name} took over editing this practice. Your unsaved changes were not saved.`
    }
    return (
      data.error ??
      "Someone else took over editing this practice. Your unsaved changes were not saved."
    )
  }

  function handleLockLost(data: { error?: string; lock?: PracticeEditLockInfo | null }) {
    if (lostRef.current) return
    lostRef.current = true
    releasedRef.current = true
    onLockLostRef.current?.(takeoverMessage(data), data.lock ?? null)
  }

  async function releaseLock() {
    if (!holdEditLock || !practiceId || releasedRef.current || lostRef.current) return
    releasedRef.current = true
    try {
      await fetch(`/api/practices/${practiceId}/lock`, {
        method: "DELETE",
        keepalive: true,
        headers: lockHeaders(),
      })
      broadcastPracticeEditLockChanged(practiceId)
    } catch {
      // best-effort; lock expires on its own
    }
  }

  useEffect(() => {
    if (!holdEditLock || !practiceId || !editLockToken) return
    releasedRef.current = false
    lostRef.current = false

    async function checkLock() {
      if (lostRef.current || releasedRef.current) return
      try {
        const res = await fetch(`/api/practices/${practiceId}/lock`, {
          method: "PATCH",
          headers: lockHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ token: tokenRef.current }),
        })
        if (res.ok || lostRef.current) return
        const data = await res.json().catch(() => ({}))
        if (res.status === 409) {
          handleLockLost(data)
          return
        }
        setError(data.error ?? "Edit lock lost — cancel and try again")
      } catch {
        // ignore transient network errors
      }
    }

    void checkLock()
    const heartbeat = window.setInterval(() => {
      void checkLock()
    }, PRACTICE_EDIT_LOCK_HEARTBEAT_MS)

    function onPageHide() {
      void releaseLock()
    }

    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.clearInterval(heartbeat)
      window.removeEventListener("pagehide", onPageHide)
      // Do not release here — React Strict Mode remounts would drop the lock.
      // Release on cancel, save, or pagehide instead.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdEditLock, practiceId, editLockToken])

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

  async function handleCancel() {
    await releaseLock()
    if (onCancel) {
      onCancel()
      return
    }
    router.push("/practices")
  }

  async function save(published: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(practiceId ? `/api/practices/${practiceId}` : "/api/practices", {
        method: practiceId ? "PATCH" : "POST",
        headers: lockHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...form, published }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && holdEditLock) {
          handleLockLost(data)
          return
        }
        setError(data.error ?? "Failed to save practice")
        return
      }
      await releaseLock()
      if (practiceId) {
        onCancel?.()
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-5">
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

        <div className="space-y-4">
          {form.sets.map((set, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 dark:border-zinc-700 p-5 space-y-3 bg-white dark:bg-zinc-900"
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

      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 sm:mx-0 sm:rounded-xl sm:border sm:px-5">
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={handleCancel}
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
  )
}
