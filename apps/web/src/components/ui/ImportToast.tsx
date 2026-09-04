"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useImportTask } from "@/components/ui/ImportTaskProvider"

function SpinnerIcon() {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground"
      aria-hidden="true"
    />
  )
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400"
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
      className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400"
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
  useEffect(() => setMounted(true), [])

  if (!mounted || tasks.length === 0) return null

  const content = (
    <div
      className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2 pointer-events-none"
      aria-live="polite"
      aria-label="Import status"
    >
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-xl border border-border/60 px-4 py-3 shadow-xl transition-all duration-300 animate-in slide-in-from-right-4 ${
            task.status === "error"
              ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50"
              : task.status === "done"
                ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50"
                : "bg-background/95 backdrop-blur-sm"
          }`}
          role="status"
        >
          {/* Status icon */}
          <div className="mt-0.5 shrink-0">
            {task.status === "running" && <SpinnerIcon />}
            {task.status === "done" && <CheckIcon />}
            {task.status === "error" && <ErrorIcon />}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            {task.status === "running" && (
              <p className="text-sm font-medium text-foreground leading-snug">
                {task.label}
              </p>
            )}
            
            {task.status === "done" && task.summary && (
              <p className="text-sm font-medium text-foreground leading-snug">
                {task.summary}
              </p>
            )}
            
            {task.status === "error" && (
              <p className="text-sm font-medium text-foreground leading-snug">
                {task.label}
              </p>
            )}
            {task.status === "error" && task.error && (
              <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">
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
              className="ml-1 shrink-0 rounded-md p-0.5 text-foreground-secondary hover:text-foreground hover:bg-fill-secondary transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-3.5 w-3.5"
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
