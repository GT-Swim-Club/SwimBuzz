"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SET_TAGS } from "@/lib/practice-tags"
import RichTextField from "@/components/RichTextField"
import { PRACTICE_EDIT_LOCK_HEARTBEAT_MS, PRACTICE_EDIT_LOCK_TOKEN_HEADER, type PracticeEditLockInfo } from "@/lib/practice-edit-lock-shared"
import { broadcastPracticeEditLockChanged } from "@/lib/practice-edit-lock-client"
import { practicePath } from "@/lib/slug"

export type SetFormState = {
  id?: string
  title: string
  content: string
  notes: string
  distance: string
}

export type PracticeFormState = {
  title: string
  date: string
  startTime: string
  endTime: string
  location: string
  focus: string
  tags: string[]
  published?: boolean
  sets: SetFormState[]
}

export const emptySet: SetFormState = {
  title: "",
  content: "",
  notes: "",
  distance: "",
}

export const emptyPractice: PracticeFormState = {
  title: "",
  date: new Date().toISOString().slice(0, 10),
  startTime: "19:30",
  endTime: "21:00",
  location: "CRC Comp Pool",
  focus: "",
  tags: [],
  sets: [{ ...emptySet }],
}

const inputCls =
  "w-full rounded-lg border border-border-secondary px-3 py-2 text-sm border-border-secondary bg-background"
const labelCls = "block text-xs font-medium text-foreground-secondary mb-1"

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
  const [isDirty, setIsDirty] = useState(false)
  const releasedRef = useRef(false)
  const lostRef = useRef(false)
  
  useEffect(() => {
    setIsDirty(JSON.stringify(form) !== JSON.stringify(initial ?? emptyPractice))
  }, [form, initial])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

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

  function toggleTag(tag: string) {
    setForm((f) => {
      const has = f.tags.includes(tag)
      return { ...f, tags: has ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }
    })
  }

  function addCustomTag(raw: string) {
    const tag = raw.trim()
    if (!tag) return
    setForm((f) => {
      if (f.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return f
      return { ...f, tags: [...f.tags, tag] }
    })
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
        router.push(practicePath(data.slug ?? data.id))
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-1">
          <div>
            <label className={labelCls}>Title <span className="text-red-500">*</span></label>
            <input
              required
              placeholder="e.g. Thursday AM — Threshold"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Date <span className="text-red-500">*</span></label>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Start time <span className="text-red-500">*</span></label>
            <input
              required
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>End time <span className="text-red-500">*</span></label>
            <input
              required
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Location <span className="text-red-500">*</span></label>
            <input
              required
              placeholder="e.g. CRC Comp Pool"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Focus / notes</label>
          <RichTextField
            rows={2}
            value={form.focus}
            onChange={(focus) => setForm((f) => ({ ...f, focus }))}
            className={`${inputCls} min-h-[3rem]`}
          />
        </div>

        <div>
          <label className={labelCls}>Practice Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {SET_TAGS.map((tag) => {
              const active = form.tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={
                    "text-xs px-2 py-0.5 rounded-full border border-border-secondary transition-colors " +
                    (active
                      ? "bg-primary border-primary text-primary-text"
                      : "border border-border-secondary dark:border border-border-secondary text-foreground-secondary dark:text-foreground-secondary hover:bg-fill-secondary dark:hover:bg-fill-secondary")
                  }
                >
                  {tag}
                </button>
              )
            })}
            {form.tags
              .filter((t) => !SET_TAGS.includes(t as (typeof SET_TAGS)[number]))
              .map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className="text-xs px-2 py-0.5 rounded-full border border-border-secondary bg-primary border-primary text-primary-text"
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
                addCustomTag(e.currentTarget.value)
                e.currentTarget.value = ""
              }
            }}
            className={`${inputCls} mt-2`}
          />
        </div>

        <div className="space-y-4">
          {form.sets.map((set, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border-secondary p-5 space-y-3 bg-background-elevated"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground-tertiary dark:text-foreground-tertiary">
                  Set {i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSet(i, -1)}
                    disabled={i === 0}
                    className="px-1.5 py-0.5 text-xs rounded border border-border-secondary dark:border border-border-secondary disabled:opacity-30"
                    aria-label="Move set up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSet(i, 1)}
                    disabled={i === form.sets.length - 1}
                    className="px-1.5 py-0.5 text-xs rounded border border-border-secondary dark:border border-border-secondary disabled:opacity-30"
                    aria-label="Move set down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSet(i)}
                    disabled={form.sets.length === 1}
                    className="px-2 py-0.5 text-xs rounded border border-border-secondary border-red-200 text-red-600 dark:border-red-900/50 dark:text-red-400 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Set name</label>
                  <input
                    placeholder="e.g. Main set"
                    value={set.title}
                    onChange={(e) => updateSet(i, { title: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Distance (yards)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder=""
                    value={set.distance}
                    onChange={(e) => updateSet(i, { distance: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Workout <span className="text-red-500">*</span></label>
                <RichTextField
                  required
                  rows={4}
                  value={set.content}
                  onChange={(content) => updateSet(i, { content })}
                  className="bg-background"
                />
              </div>

              <div>
                <label className={labelCls}>Coach notes</label>
                <RichTextField
                  value={set.notes}
                  onChange={(notes) => updateSet(i, { notes })}
                  className="bg-background !min-h-[2.5rem]"
                />
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSet}
          className="w-full rounded-lg border border-border-secondary border-dashed border-border-secondary px-4 py-2.5 text-sm text-foreground-secondary hover:bg-fill-secondary transition-colors"
        >
          + Add set
        </button>
      </div>

      <div className="sticky bottom-0 -mx-4 border-t border-border-secondary bg-background/95 px-4 py-4 backdrop-blur dark:border-zinc-800 bg-background/95 sm:mx-0 sm:rounded-xl sm:border border-border-secondary sm:px-5">
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary hover:bg-fill-secondary border-border-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save(false)}
            disabled={
              loading ||
              !form.title.trim() ||
              !form.date.trim() ||
              !form.startTime.trim() ||
              !form.endTime.trim() ||
              !form.location.trim() ||
              form.sets.some((s) => !s.content.trim())
            }
            className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary hover:bg-fill-secondary border-border-secondary disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={
              loading ||
              !form.title.trim() ||
              !form.date.trim() ||
              !form.startTime.trim() ||
              !form.endTime.trim() ||
              !form.location.trim() ||
              form.sets.some((s) => !s.content.trim())
            }
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? "Saving…" : "Publish"}
          </button>
        </div>
      </div>
    </form>
  )
}
