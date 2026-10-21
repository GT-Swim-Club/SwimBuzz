"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"

export type ImportTask = {
  id: string
  /** Short human-readable label shown while running, e.g. "Importing roster…" */
  label: string
  status: "running" | "done" | "error"
  /** Short summary shown on success, e.g. "Imported 12 athletes" */
  summary?: string
  /** Error message shown on failure */
  error?: string
  /** Secondary progress line while running, e.g. "2/5 athletes · Jane Doe" */
  detail?: string
  /** Action the user must take for the task to continue, e.g. a Cloudflare check */
  alert?: string
}

export type ImportTaskProgress = Pick<ImportTask, "detail" | "alert">

type ImportTaskContextValue = {
  tasks: ImportTask[]
  /**
   * Start a background import task.
   * @param label  Text to show while the task is running.
   * @param promise  Must resolve to a short summary string on success,
   *                 or reject/throw with an Error (message is shown in the toast).
   *                 Pass a function instead to receive a `report` callback for
   *                 live progress (replaces the task's detail/alert).
   */
  startTask: (
    label: string,
    promise: Promise<string> | ((report: (progress: ImportTaskProgress) => void) => Promise<string>)
  ) => void
  dismissTask: (id: string) => void
}

const ImportTaskContext = createContext<ImportTaskContextValue | null>(null)

export function useImportTask() {
  const ctx = useContext(ImportTaskContext)
  if (!ctx) throw new Error("useImportTask must be used within ImportTaskProvider")
  return ctx
}

/**
 * How long (ms) the user must be present on the page before a completed toast
 * auto-dismisses. Imports often finish while the user is elsewhere, so the
 * countdown only runs while the tab is visible, focused, and the user has
 * interacted with the page since the task finished (and recently).
 */
const AUTO_DISMISS_MS = 5000
/** Input within this window (ms) counts as the user still being present. */
const PRESENCE_WINDOW_MS = 5000
const PRESENCE_TICK_MS = 500
const PRESENCE_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const

let _nextId = 1

export default function ImportTaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ImportTask[]>([])
  /** Completed tasks awaiting auto-dismiss: when they finished and how much presence time is left. */
  const pendingDismissRef = useRef<Record<string, { doneAt: number; remainingMs: number }>>({})

  const isAnyRunning = tasks.some((t) => t.status === "running")
  const isAnyDone = tasks.some((t) => t.status === "done")
  useDontReloadWhileBusy(isAnyRunning)

  const dismissTask = useCallback((id: string) => {
    delete pendingDismissRef.current[id]
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Count down completed toasts only while the user is actually on the page.
  useEffect(() => {
    if (!isAnyDone) return
    let lastActivity = 0
    const onActivity = () => {
      lastActivity = Date.now()
    }
    for (const type of PRESENCE_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true })
    }

    let lastTick = Date.now()
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastTick
      lastTick = now
      const present =
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        now - lastActivity < PRESENCE_WINDOW_MS
      if (!present) return

      const expired: string[] = []
      for (const [id, pending] of Object.entries(pendingDismissRef.current)) {
        // Activity from before the task finished doesn't mean the user saw it.
        if (lastActivity < pending.doneAt) continue
        pending.remainingMs -= elapsed
        if (pending.remainingMs <= 0) expired.push(id)
      }
      if (expired.length === 0) return
      for (const id of expired) delete pendingDismissRef.current[id]
      setTasks((prev) => prev.filter((t) => !expired.includes(t.id)))
    }, PRESENCE_TICK_MS)

    return () => {
      clearInterval(interval)
      for (const type of PRESENCE_EVENTS) {
        window.removeEventListener(type, onActivity)
      }
    }
  }, [isAnyDone])

  const startTask = useCallback(
    (
      label: string,
      run: Promise<string> | ((report: (progress: ImportTaskProgress) => void) => Promise<string>)
    ) => {
      const id = String(_nextId++)

      setTasks((prev) => [
        ...prev,
        { id, label, status: "running" },
      ])

      const report = ({ detail, alert }: ImportTaskProgress) => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id && t.status === "running" ? { ...t, detail, alert } : t
          )
        )
      }
      const promise = typeof run === "function" ? run(report) : run

      promise.then(
        (summary) => {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, status: "done", summary, detail: undefined, alert: undefined }
                : t
            )
          )
          // Auto-dismiss once the user has been present long enough to see it
          pendingDismissRef.current[id] = { doneAt: Date.now(), remainingMs: AUTO_DISMISS_MS }
        },
        (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Import failed"
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, status: "error", error: message, detail: undefined, alert: undefined }
                : t
            )
          )
          // Errors do NOT auto-dismiss — user must close manually
        }
      )
    },
    []
  )

  return (
    <ImportTaskContext.Provider value={{ tasks, startTask, dismissTask }}>
      {children}
    </ImportTaskContext.Provider>
  )
}
