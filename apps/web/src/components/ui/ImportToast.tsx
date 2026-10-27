"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { useImportTask } from "@/components/ui/ImportTaskProvider"

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right"

const CORNER_STORAGE_KEY = "swimbuzz:toast-corner"

const CORNER_CLASSES: Record<Corner, string> = {
  "top-left": "top-4 left-4 flex-col",
  "top-right": "top-4 right-4 flex-col",
  "bottom-left": "bottom-4 left-4 flex-col-reverse",
  "bottom-right": "bottom-4 right-4 flex-col-reverse",
}

function isCorner(value: unknown): value is Corner {
  return typeof value === "string" && value in CORNER_CLASSES
}

function readSavedCorner(): Corner {
  if (typeof window === "undefined") return "bottom-right"
  try {
    const saved = localStorage.getItem(CORNER_STORAGE_KEY)
    if (isCorner(saved)) return saved
  } catch {}
  return "bottom-right"
}

/** Determinate when `progress` (0–1) is known, otherwise an indeterminate sweep. */
function ProgressBar({ progress }: { progress?: number }) {
  const known = typeof progress === "number"
  const percent = known ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : undefined
  return (
    <div
      className="mt-3 h-2 w-full overflow-hidden rounded-full bg-fill-secondary"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      {known ? (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      ) : (
        <div className="import-toast-bar-indeterminate h-full w-2/5 rounded-full bg-primary" />
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-5 w-5 shrink-0 text-success"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-5 w-5 shrink-0 text-error"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function ImportToast() {
  const { tasks, dismissTask } = useImportTask()
  const [mounted, setMounted] = useState(false)
  // Nothing renders before `mounted`, so reading storage here can't cause a hydration mismatch.
  const [corner, setCorner] = useState<Corner>(readSavedCorner)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [settling, setSettling] = useState(false)
  const [releaseTick, setReleaseTick] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null)
  // Where the stack was when released, so it can glide into its snapped corner.
  const releasedFromRef = useRef<{ left: number; top: number } | null>(null)

  useEffect(() => setMounted(true), [])

  // After snapping to a corner, start from the released position and animate to rest.
  useLayoutEffect(() => {
    const from = releasedFromRef.current
    const el = containerRef.current
    if (!from || !el) return
    releasedFromRef.current = null
    const rect = el.getBoundingClientRect()
    setSettling(false)
    setOffset({ x: from.left - rect.left, y: from.top - rect.top })
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setSettling(true)
        setOffset({ x: 0, y: 0 })
      }),
    )
    return () => cancelAnimationFrame(frame)
  }, [releaseTick])

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    setSettling(false)
    setDragging(true)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setOffset({ x: e.clientX - drag.startX, y: e.clientY - drag.startY })
  }

  function handlePointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    const rect = e.currentTarget.getBoundingClientRect()
    const vertical = rect.top + rect.height / 2 < window.innerHeight / 2 ? "top" : "bottom"
    const horizontal = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right"
    const next = `${vertical}-${horizontal}` as Corner
    releasedFromRef.current = { left: rect.left, top: rect.top }
    setCorner(next)
    setOffset({ x: 0, y: 0 })
    setReleaseTick((tick) => tick + 1)
    try {
      localStorage.setItem(CORNER_STORAGE_KEY, next)
    } catch {}
  }

  if (!mounted || tasks.length === 0) return null

  const content = (
    <div
      ref={containerRef}
      className={`fixed z-[60] flex gap-2 pointer-events-none ${CORNER_CLASSES[corner]} ${
        settling ? "transition-transform duration-300 ease-out" : ""
      }`}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      aria-live="polite"
      aria-label="Import status"
    >
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`pointer-events-auto flex max-w-md touch-none items-start ${task.status === "running" ? "w-96" : ""} gap-4 rounded-2xl border px-5 py-4 shadow-xl transition-all duration-300 animate-in ${
            corner.endsWith("left") ? "slide-in-from-left-4" : "slide-in-from-right-4"
          } ${dragging ? "cursor-grabbing select-none" : "cursor-grab"} ${
            task.status === "error"
              ? "bg-error-bg border-error-border"
              : task.status === "done"
                ? "bg-success-bg border-success-border"
                : task.alert
                  ? "bg-warning-bg border-warning-border"
                  : "border-border/60 bg-background/95 backdrop-blur-sm"
          }`}
          role="status"
        >
          {/* Status icon (running tasks show a progress bar instead) */}
          {task.status !== "running" && (
            <div className="mt-0.5 shrink-0">
              {task.status === "done" && <CheckIcon />}
              {task.status === "error" && <ErrorIcon />}
            </div>
          )}

          {/* Text */}
          <div className="flex-1 min-w-0">
            {task.status === "running" && (
              <p className="text-base font-medium text-foreground leading-snug">
                {task.label}
              </p>
            )}
            {task.status === "running" && task.detail && (
              <p className="mt-1 text-sm text-foreground-secondary tabular-nums truncate">
                {task.detail}
              </p>
            )}
            {task.status === "running" && task.alert && (
              <p className="mt-1.5 text-sm font-medium text-warning" role="alert">
                {task.alert}
              </p>
            )}
            {task.status === "running" && !task.alert && task.notice && (
              <p className="mt-1.5 text-sm text-foreground-secondary">{task.notice}</p>
            )}
            {task.status === "running" && <ProgressBar progress={task.progress} />}
            
            {task.status === "done" && task.summary && (
              <p className="text-base font-medium text-foreground leading-snug">
                {task.summary}
              </p>
            )}
            
            {task.status === "error" && (
              <p className="text-base font-medium text-foreground leading-snug">
                {task.label}
              </p>
            )}
            {task.status === "error" && task.error && (
              <p className="mt-1 text-sm text-error">
                {task.error}
              </p>
            )}
          </div>

          {/* Dismiss button */}
          {task.status !== "running" && (
            <button
              type="button"
              onClick={() => dismissTask(task.id)}
              aria-label="Dismiss"
              className="ml-1 shrink-0 rounded-md p-1 text-foreground-secondary hover:text-foreground hover:bg-fill-secondary transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22z" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )

  return createPortal(content, document.body)
}
