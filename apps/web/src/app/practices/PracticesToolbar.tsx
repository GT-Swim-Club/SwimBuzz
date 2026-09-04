"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type RefObject } from "react"
import HoverDetail from "@/components/ui/HoverDetail"
import PracticeTagManager from "./PracticeTagManager"
import type { PracticePrefs, PracticeRailView } from "./usePracticePrefs"

type ManagedTag = { id: string; name: string }

const controlClass =
  "group relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-secondary bg-background text-foreground transition-colors hover:bg-fill-secondary"

function SidebarHideIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function WeekIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-foreground-secondary" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
      <path d="M10 14h4" /><path d="M10 18h4" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-foreground-secondary" aria-hidden="true">
      <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
      <path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
    </svg>
  )
}

function MonThuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-foreground-secondary" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M8 2v4" /><path d="M16 2v4" /><path d="M3 10h18" />
      <path d="M8 14v4" /><path d="M11 14v4" /><path d="M14 14v4" />
    </svg>
  )
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border " +
        (selected ? "border-primary" : "border-border-secondary")
      }
    >
      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
  )
}

function useOutsideClose(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    function onMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open, ref, onClose])
}

function SettingsPopover({ prefs }: { prefs: PracticePrefs }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(open, ref, () => setOpen(false))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-label="View settings"
        className={controlClass}
      >
        <SettingsIcon />
        <HoverDetail label="View settings" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-max min-w-[180px] max-w-[280px] rounded-xl border border-border-secondary bg-background p-2 shadow-lg">
          <div className="mb-1.5 border-b border-border-secondary px-2 pb-2 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">View</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {(["week", "list"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => prefs.setView(view)}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-fill-secondary"
              >
                <RadioDot selected={prefs.view === view} />
                {view === "week" ? <WeekIcon /> : <ListIcon />}
                <span>{view === "week" ? "Week" : "List"}</span>
              </button>
            ))}
          </div>

          {prefs.view === "week" ? (
            <div className="mt-1.5 border-t border-border-secondary pt-1.5">
              <div className="flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-2">
                <MonThuIcon />
                <span className="flex-1 text-sm text-foreground">Mon–Thu</span>
                <button
                  type="button"
                  onClick={() => prefs.setMonThuOnly(!prefs.monThuOnly)}
                  aria-pressed={prefs.monThuOnly}
                  className={
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors " +
                    (prefs.monThuOnly ? "bg-primary" : "bg-fill")
                  }
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-200"
                    style={{ left: prefs.monThuOnly ? 18 : 2 }}
                  />
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 border-t border-border-secondary pt-1.5">
              <div className="px-2 pb-2 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Sort by</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {(
                  [
                    ["date-desc", "Date (newest first)"],
                    ["date-asc", "Date (oldest first)"],
                    ["yards-desc", "Distance (longest first)"],
                    ["yards-asc", "Distance (shortest first)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => prefs.setSort(value)}
                    className="flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-fill-secondary"
                  >
                    <RadioDot selected={prefs.sort === value} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PracticesToolbar({
  isCoach,
  managedTags,
  prefs,
  q,
  onQueryChange,
  tags,
  onTagsChange,
}: {
  isCoach: boolean
  managedTags: ManagedTag[]
  prefs: PracticePrefs
  q: string
  onQueryChange: (value: string) => void
  tags: string[]
  onTagsChange: (tags: string[]) => void
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(q))
  const inputRef = useRef<HTMLInputElement>(null)
  const preSearchViewRef = useRef<PracticeRailView | null>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  // Plain client-side filtering (same as the roster/meet signup pages) — every
  // keystroke updates the list immediately, no debounce or URL round-trip.
  // While a query is active we force list view; once the query is cleared we
  // restore whatever view was active before the search started.
  function handleQueryChange(value: string) {
    onQueryChange(value)
    if (value.trim()) {
      if (preSearchViewRef.current === null) preSearchViewRef.current = prefs.view
      if (prefs.view !== "list") prefs.setView("list")
    } else if (preSearchViewRef.current !== null) {
      prefs.setView(preSearchViewRef.current)
      preSearchViewRef.current = null
    }
  }

  function closeSearch() {
    setSearchOpen(false)
    if (q.trim()) handleQueryChange("")
  }

  if (searchOpen) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={closeSearch} aria-label="Exit search" title="Exit search" className={controlClass}>
          <BackIcon />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search practices…"
            className="h-10 w-full min-w-0 rounded-lg border border-border-secondary bg-background py-0 pl-3 pr-10 text-sm outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                handleQueryChange("")
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              title="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => prefs.setSidebarOpen(false)}
        aria-label="Hide sidebar"
        title="Hide sidebar"
        className={"hidden md:inline-flex " + controlClass}
      >
        <SidebarHideIcon />
      </button>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search practices"
        title="Search practices"
        className={controlClass}
      >
        <SearchIcon />
        {q && (
          <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>

      <div className="ml-auto flex items-center gap-2">
        <PracticeTagManager
          initialTags={managedTags}
          isCoach={isCoach}
          activeTags={tags}
          onTagsChange={onTagsChange}
        />
        <SettingsPopover prefs={prefs} />
        {isCoach && (
          <Link
            href="/practices/new"
            aria-label="New practice"
            title="New practice"
            className={controlClass + " border-0 bg-primary text-primary-text hover:bg-primary-hover"}
          >
            <PlusIcon />
          </Link>
        )}
      </div>
    </div>
  )
}
