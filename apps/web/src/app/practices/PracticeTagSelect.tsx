"use client"

import { useEffect, useId, useRef, useState } from "react"

/**
 * Multi-select dropdown for a practice's tags. The closed field reads as the same
 * comma-separated list the practice page shows; the panel is a checklist of the
 * shared tag catalog.
 */
export default function PracticeTagSelect({
  value,
  availableTags,
  onToggle,
}: {
  value: string[]
  availableTags: string[]
  onToggle: (tag: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  // Keep tags that were removed from the catalog visible so they can still be cleared.
  const options = [...availableTags, ...value.filter((t) => !availableTags.includes(t))]

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  if (options.length === 0) {
    return (
      <p className="min-w-0 flex-1 py-2 text-xs text-foreground-tertiary">
        No shared tags have been added yet. Manage tags from the Practices page.
      </p>
    )
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label="Practice tags"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm outline-none transition focus:ring-2 focus:ring-primary/10 ${
          open ? "border-primary ring-2 ring-primary/10" : "border-border focus:border-primary"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${value.length > 0 ? "text-foreground" : "text-foreground-tertiary"}`}>
          {value.length > 0 ? value.join(", ") : "Add tags"}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 shrink-0 text-foreground-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable
          aria-label="Practice tags"
          className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-48 overflow-y-auto rounded-xl border border-border bg-background-elevated p-1 shadow-2xl shadow-black/30"
        >
          {options.map((tag) => {
            const active = value.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onToggle(tag)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-fill-secondary"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    active ? "border-primary bg-primary text-primary-text" : "border-border-secondary"
                  }`}
                >
                  {active && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 truncate">{tag}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
