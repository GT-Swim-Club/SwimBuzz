import { useRef, useState } from "react"

const DEFAULT_COALESCE_MS = 900
const DEFAULT_LIMIT = 100

/**
 * A single piece of state with an in-memory undo/redo stack. Consecutive `set` calls
 * sharing the same `historyKey` within `coalesceMs` collapse into one undo step (e.g.
 * keystrokes in one field); calls without a key each land as their own discrete step.
 * History lives only for the life of the hook — nothing is persisted to storage.
 */
export function useUndoableState<T>(
  initial: T,
  options?: { coalesceMs?: number; limit?: number }
) {
  const coalesceMs = options?.coalesceMs ?? DEFAULT_COALESCE_MS
  const limit = options?.limit ?? DEFAULT_LIMIT
  const [value, setValue] = useState(initial)
  const valueRef = useRef(value)
  valueRef.current = value
  const historyRef = useRef<{ past: T[]; future: T[] }>({ past: [], future: [] })
  const lastEntryRef = useRef<{ key: string; at: number } | null>(null)
  const [counts, setCounts] = useState({ past: 0, future: 0 })

  function set(next: T | ((current: T) => T), historyKey?: string) {
    const previous = valueRef.current
    const nextValue = typeof next === "function" ? (next as (current: T) => T)(previous) : next
    const now = Date.now()
    const last = lastEntryRef.current
    if (historyKey && last && last.key === historyKey && now - last.at < coalesceMs) {
      last.at = now
    } else {
      const history = historyRef.current
      history.past = [...history.past, previous].slice(-limit)
      history.future = []
      lastEntryRef.current = historyKey ? { key: historyKey, at: now } : null
      setCounts({ past: history.past.length, future: 0 })
    }
    valueRef.current = nextValue
    setValue(nextValue)
  }

  /** Re-seeds the value (e.g. from a server refetch) and clears history, since older
   * snapshots would no longer match the freshly loaded state. */
  function reset(next: T) {
    historyRef.current = { past: [], future: [] }
    lastEntryRef.current = null
    setCounts({ past: 0, future: 0 })
    valueRef.current = next
    setValue(next)
  }

  function undo() {
    const history = historyRef.current
    const snapshot = history.past[history.past.length - 1]
    if (snapshot === undefined) return
    history.past = history.past.slice(0, -1)
    history.future = [valueRef.current, ...history.future].slice(0, limit)
    lastEntryRef.current = null
    valueRef.current = snapshot
    setValue(snapshot)
    setCounts({ past: history.past.length, future: history.future.length })
  }

  function redo() {
    const history = historyRef.current
    const snapshot = history.future[0]
    if (snapshot === undefined) return
    history.future = history.future.slice(1)
    history.past = [...history.past, valueRef.current].slice(-limit)
    lastEntryRef.current = null
    valueRef.current = snapshot
    setValue(snapshot)
    setCounts({ past: history.past.length, future: history.future.length })
  }

  return {
    value,
    set,
    reset,
    undo,
    redo,
    canUndo: counts.past > 0,
    canRedo: counts.future > 0,
  }
}
