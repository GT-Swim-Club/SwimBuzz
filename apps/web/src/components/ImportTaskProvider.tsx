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
}

type ImportTaskContextValue = {
  tasks: ImportTask[]
  /**
   * Start a background import task.
   * @param label  Text to show while the task is running.
   * @param promise  Must resolve to a short summary string on success,
   *                 or reject/throw with an Error (message is shown in the toast).
   */
  startTask: (label: string, promise: Promise<string>) => void
  dismissTask: (id: string) => void
}

const ImportTaskContext = createContext<ImportTaskContextValue | null>(null)

export function useImportTask() {
  const ctx = useContext(ImportTaskContext)
  if (!ctx) throw new Error("useImportTask must be used within ImportTaskProvider")
  return ctx
}

/** How long (ms) a completed toast stays visible before auto-dismissing. */
const AUTO_DISMISS_MS = 7000

let _nextId = 1

export default function ImportTaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ImportTask[]>([])
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const isAnyRunning = tasks.some((t) => t.status === "running")
  useDontReloadWhileBusy(isAnyRunning)

  const dismissTask = useCallback((id: string) => {
    clearTimeout(timersRef.current[id])
    delete timersRef.current[id]
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Clean up all timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t)
    }
  }, [])

  const startTask = useCallback(
    (label: string, promise: Promise<string>) => {
      const id = String(_nextId++)

      setTasks((prev) => [
        ...prev,
        { id, label, status: "running" },
      ])

      promise.then(
        (summary) => {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, status: "done", summary } : t
            )
          )
          // Auto-dismiss after a delay
          timersRef.current[id] = setTimeout(() => {
            setTasks((prev) => prev.filter((t) => t.id !== id))
            delete timersRef.current[id]
          }, AUTO_DISMISS_MS)
        },
        (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Import failed"
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, status: "error", error: message } : t
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
