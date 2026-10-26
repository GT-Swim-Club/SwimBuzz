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
import { isPageInView, playAttentionChime, primeAttentionChime } from "@/lib/attention-chime"
import { rememberDismissedScraperJob } from "@/lib/scraper/scraper-job-lock"

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
  /** Warning the user must act on, e.g. a Cloudflare check to complete; tints the toast */
  alert?: string
  /** Heads-up that needs no action, e.g. a rate-limit pause; keeps the normal toast background */
  notice?: string
  /** 0–1 completion for the toast's progress bar; indeterminate when unset */
  progress?: number
}

export type ImportTaskProgress = Pick<ImportTask, "detail" | "alert" | "notice" | "progress"> & {
  /** Show the alert without the attention chime, e.g. the user is already in the scraper's browser. */
  quiet?: boolean
}

export type ImportTaskOptions = {
  /**
   * A scraper job keeps running on the coach's computer after the page is gone,
   * and the toast is restored from the server. A request import is tied to this
   * page: reloading cancels it and the next load says so.
   */
  lifetime?: "request" | "scraper"
  /** A failed scraper job the user closes should not come back on the next visit. */
  dismissKey?: string
}

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
    promise: Promise<string> | ((report: (progress: ImportTaskProgress) => void) => Promise<string>),
    options?: ImportTaskOptions
  ) => void
  dismissTask: (id: string) => void
}

const OPEN_REQUESTS_KEY = "swimbuzz-open-imports"

type OpenRequest = { id: string; label: string }

function readOpenRequests(): OpenRequest[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(OPEN_REQUESTS_KEY) ?? "[]") as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is OpenRequest =>
        !!item &&
        typeof item === "object" &&
        typeof (item as OpenRequest).id === "string" &&
        typeof (item as OpenRequest).label === "string"
    )
  } catch {
    return []
  }
}

function writeOpenRequests(items: OpenRequest[]) {
  try {
    if (items.length === 0) sessionStorage.removeItem(OPEN_REQUESTS_KEY)
    else sessionStorage.setItem(OPEN_REQUESTS_KEY, JSON.stringify(items))
  } catch {
    // Private mode or a full quota shouldn't block the import.
  }
}

const ImportTaskContext = createContext<ImportTaskContextValue | null>(null)

export function useImportTask() {
  const ctx = useContext(ImportTaskContext)
  if (!ctx) throw new Error("useImportTask must be used within ImportTaskProvider")
  return ctx
}

/**
 * How long (ms) the user must be present on the page before a finished (done or
 * failed) toast auto-dismisses. Imports often finish while the user is elsewhere, so the
 * countdown only runs while the tab is visible, focused, and the user has
 * interacted with the page since the task finished (and recently).
 */
const AUTO_DISMISS_MS = 5000
/** Input within this window (ms) counts as the user still being present. */
const PRESENCE_WINDOW_MS = 5000
const PRESENCE_TICK_MS = 500
const PRESENCE_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const

let _nextId = 1

export default function ImportTaskProvider({
  children,
  alertSound,
}: {
  children: ReactNode
  alertSound: boolean
}) {
  const [tasks, setTasks] = useState<ImportTask[]>([])
  /** Read from callbacks that outlive a render, so toggling the setting applies to tasks already running. */
  const alertSoundRef = useRef(alertSound)
  alertSoundRef.current = alertSound
  /** Completed tasks awaiting auto-dismiss: when they finished and how much presence time is left. */
  const pendingDismissRef = useRef<Record<string, { doneAt: number; remainingMs: number }>>({})
  /** Each running task's current alert, to chime only when a new one appears. */
  const alertsRef = useRef<Record<string, string | undefined>>({})
  /** Failed scraper jobs to remember once the user dismisses the toast. */
  const dismissKeysRef = useRef<Record<string, string>>({})
  /** Set on pagehide so a dying page doesn't clear the "this import was cancelled" marker. */
  const unloadingRef = useRef(false)

  const isAnyRunning = tasks.some((t) => t.status === "running")
  const isAnyFinished = tasks.some((t) => t.status !== "running")
  useDontReloadWhileBusy(isAnyRunning)

  const dismissTask = useCallback((id: string) => {
    const dismissKey = dismissKeysRef.current[id]
    if (dismissKey) {
      rememberDismissedScraperJob(dismissKey)
      delete dismissKeysRef.current[id]
    }
    delete pendingDismissRef.current[id]
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const onHide = () => {
      unloadingRef.current = true
    }
    window.addEventListener("pagehide", onHide)
    const interrupted = readOpenRequests()
    writeOpenRequests([])
    const toastIds = interrupted.map((item) => `cancelled-${item.id}`)
    if (interrupted.length > 0) {
      for (const id of toastIds) {
        pendingDismissRef.current[id] = { doneAt: Date.now(), remainingMs: AUTO_DISMISS_MS }
      }
      setTasks((prev) => [
        ...prev.filter((task) => !toastIds.includes(task.id)),
        ...interrupted.map((item, index) => ({
          id: toastIds[index],
          label: item.label,
          status: "error" as const,
          error: "Cancelled because the page reloaded. Run it again to finish.",
        })),
      ])
    }
    return () => {
      window.removeEventListener("pagehide", onHide)
      // Dev remounts this effect. Put the marker back unless the page is actually
      // leaving, and don't clobber an import that started in the meantime.
      if (unloadingRef.current || interrupted.length === 0) return
      setTasks((prev) => prev.filter((task) => !toastIds.includes(task.id)))
      const current = readOpenRequests()
      const ids = new Set(current.map((item) => item.id))
      const missing = interrupted.filter((item) => !ids.has(item.id))
      if (missing.length > 0) writeOpenRequests([...missing, ...current])
    }
  }, [])

  // Count down finished toasts (done or failed) only while the user is actually on the page.
  useEffect(() => {
    if (!isAnyFinished) return
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
      for (const id of expired) {
        delete pendingDismissRef.current[id]
        // Same as closing it by hand: a failed scraper job shouldn't return next visit.
        const dismissKey = dismissKeysRef.current[id]
        if (dismissKey) {
          rememberDismissedScraperJob(dismissKey)
          delete dismissKeysRef.current[id]
        }
      }
      setTasks((prev) => prev.filter((t) => !expired.includes(t.id)))
    }, PRESENCE_TICK_MS)

    return () => {
      clearInterval(interval)
      for (const type of PRESENCE_EVENTS) {
        window.removeEventListener(type, onActivity)
      }
    }
  }, [isAnyFinished])

  const startTask = useCallback(
    (
      label: string,
      run: Promise<string> | ((report: (progress: ImportTaskProgress) => void) => Promise<string>),
      options?: ImportTaskOptions
    ) => {
      const id = String(_nextId++)
      const lifetime = options?.lifetime ?? "request"
      if (options?.dismissKey) dismissKeysRef.current[id] = options.dismissKey
      // Imports start from a click, so audio can be unlocked now for an alert chime later.
      primeAttentionChime()

      if (lifetime === "request") {
        writeOpenRequests([...readOpenRequests(), { id, label }])
      }

      setTasks((prev) => [
        ...prev,
        { id, label, status: "running" },
      ])

      const report = ({ detail, alert, notice, progress, quiet }: ImportTaskProgress) => {
        // An alert needs the user (e.g. a Cloudflare check) — chime if they've switched away.
        if (alert && alert !== alertsRef.current[id] && alertSoundRef.current && !quiet && !isPageInView()) {
          playAttentionChime()
        }
        alertsRef.current[id] = alert
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id && t.status === "running" ? { ...t, detail, alert, notice, progress } : t
          )
        )
      }
      const promise = typeof run === "function" ? run(report) : run

      const forgetRequest = () => {
        if (lifetime !== "request" || unloadingRef.current) return
        writeOpenRequests(readOpenRequests().filter((item) => item.id !== id))
      }

      promise.then(
        (summary) => {
          forgetRequest()
          delete alertsRef.current[id]
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, status: "done", summary, detail: undefined, alert: undefined, notice: undefined, progress: undefined }
                : t
            )
          )
          // Auto-dismiss once the user has been present long enough to see it
          pendingDismissRef.current[id] = { doneAt: Date.now(), remainingMs: AUTO_DISMISS_MS }
        },
        (err: unknown) => {
          forgetRequest()
          const message =
            err instanceof Error ? err.message : "Import failed"
          delete alertsRef.current[id]
          setTasks((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, status: "error", error: message, detail: undefined, alert: undefined, notice: undefined, progress: undefined }
                : t
            )
          )
          pendingDismissRef.current[id] = { doneAt: Date.now(), remainingMs: AUTO_DISMISS_MS }
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
