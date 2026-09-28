"use client"

import Link from "next/link"
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { AppIcon } from "@/components/ui/AppIcon"
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
      <path d="M10 14h4" /><path d="M10 18h4" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
      <path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
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

function DateSortDescIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
      <path d="M12 13v6" /><path d="m9 16 3 3 3-3" />
    </svg>
  )
}

function DateSortAscIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />
      <path d="M12 19v-6" /><path d="m9 16 3-3 3 3" />
    </svg>
  )
}

function DistanceSortDescIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M7 4v2" /><path d="M11 4v3" /><path d="M15 4v2" /><path d="M19 4v3" />
      <path d="M12 13v6" /><path d="m9 16 3 3 3-3" />
    </svg>
  )
}

function DistanceSortAscIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M7 4v2" /><path d="M11 4v3" /><path d="M15 4v2" /><path d="M19 4v3" />
      <path d="M12 19v-6" /><path d="m9 16 3-3 3 3" />
    </svg>
  )
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-primary-active dark:text-primary-hover" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

// Marks a portal-rendered flyout (see SortSubmenu) so useOutsideClose below doesn't treat a
// click inside it as "outside" — it lives outside `ref`'s DOM subtree once portalled.
const FLYOUT_SCOPE_ATTR = "data-practices-settings-flyout"

function useOutsideClose(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Element
      if (ref.current && !ref.current.contains(target) && !target.closest(`[${FLYOUT_SCOPE_ATTR}]`)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [open, ref, onClose])
}

// Viewport gap kept when a flyout is nudged back into view.
const VIEWPORT_PADDING = 8

// Shared row style for a selectable dropdown option — icon and label both pick up the same
// lighter gold used for "Set Name" in the practice editor (currentColor/inheritance) when
// selected, alongside the checkmark.
function optionRowClass(selected: boolean) {
  return (
    "flex items-center gap-2 whitespace-nowrap rounded-lg px-2 py-2 text-left text-sm hover:bg-fill-secondary " +
    (selected ? "text-primary-active dark:text-primary-hover" : "text-foreground")
  )
}

const RAIL_VIEWS = ["week", "list"] as const
const RAIL_VIEWS_WITH_DELETED = ["week", "list", "deleted"] as const

const SORT_OPTIONS = [
  ["date-desc", "Date (newest first)", DateSortDescIcon],
  ["date-asc", "Date (oldest first)", DateSortAscIcon],
  ["yards-desc", "Distance (longest first)", DistanceSortDescIcon],
  ["yards-asc", "Distance (shortest first)", DistanceSortAscIcon],
] as const

function SortSubmenu({ prefs, onSelect }: { prefs: PracticePrefs; onSelect: () => void }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function openMenu() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  // Rendered in a portal below (not CSS position:absolute) so the practices sidebar's
  // overflow-hidden scroll container can't clip a flyout that extends past its edge —
  // same fix as HoverDetail.tsx. Position is computed from the trigger's viewport rect,
  // flipping to the left when there isn't room on the right.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return

    const triggerRect = trigger.getBoundingClientRect()
    const panelWidth = panelRef.current?.offsetWidth ?? 200
    const panelHeight = panelRef.current?.offsetHeight ?? 0
    const gap = 4

    const fitsRight = triggerRect.right + gap + panelWidth <= window.innerWidth - VIEWPORT_PADDING
    const left = fitsRight
      ? triggerRect.right + gap
      : Math.max(VIEWPORT_PADDING, triggerRect.left - gap - panelWidth)
    const top = Math.min(
      triggerRect.top,
      Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - panelHeight)
    )

    setPosition({ top, left })
  }, [open])

  return (
    <div ref={triggerRef} className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className={"w-full " + optionRowClass(open)}
      >
        <SortIcon />
        <span className="flex-1">Sort by</span>
        <ChevronRightIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            {...{ [FLYOUT_SCOPE_ATTR]: true }}
            onMouseEnter={openMenu}
            onMouseLeave={scheduleClose}
            style={{ position: "fixed", top: position?.top ?? -9999, left: position?.left ?? -9999 }}
            className="z-40 w-max rounded-xl border border-border-secondary bg-background p-2 shadow-lg"
          >
            <div className="flex flex-col gap-0.5">
              {SORT_OPTIONS.map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    prefs.setSort(value)
                    setOpen(false)
                    onSelect()
                  }}
                  className={optionRowClass(prefs.sort === value)}
                >
                  <Icon />
                  <span className="flex-1">{label}</span>
                  {prefs.sort === value && <CheckIcon />}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function SettingsPopover({ prefs, isCoach }: { prefs: PracticePrefs; isCoach: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(open, ref, () => setOpen(false))
  const views = isCoach ? RAIL_VIEWS_WITH_DELETED : RAIL_VIEWS

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
        {!open && <HoverDetail label="View settings" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-40 rounded-xl border border-border-secondary bg-background p-2 shadow-lg">
          <div className="flex flex-col gap-0.5">
            {views.map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => {
                  prefs.setView(view)
                  setOpen(false)
                }}
                className={optionRowClass(prefs.view === view)}
              >
                {view === "week" ? <WeekIcon /> : view === "list" ? <ListIcon /> : (
                  <AppIcon name="trash" className="h-4 w-4 shrink-0" />
                )}
                <span className="flex-1">{view === "week" ? "Week" : view === "list" ? "List" : "Trash"}</span>
                {prefs.view === view && <CheckIcon />}
              </button>
            ))}
          </div>

          {(prefs.view === "week" || prefs.view === "list") && (
            <div className="mt-1.5 border-t border-border-secondary pt-1.5">
              <div className="flex flex-col gap-0.5">
                {(["time", "tags"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      prefs.setCardLabel(value)
                      setOpen(false)
                    }}
                    className={optionRowClass(prefs.cardLabel === value)}
                  >
                    {value === "time" ? <ClockIcon /> : <TagIcon />}
                    <span className="flex-1">{value === "time" ? "Time" : "Tags"}</span>
                    {prefs.cardLabel === value && <CheckIcon />}
                  </button>
                ))}
              </div>
            </div>
          )}

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
          ) : prefs.view === "list" || prefs.view === "deleted" ? (
            <div className="mt-1.5 border-t border-border-secondary pt-1.5">
              <SortSubmenu prefs={prefs} onSelect={() => setOpen(false)} />
            </div>
          ) : null}
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
      // Week view can't show arbitrary search matches — list and deleted are
      // already flat lists, so a search just filters them in place.
      if (prefs.view === "week") prefs.setView("list")
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
        className={"hidden md:inline-flex " + controlClass}
      >
        <SidebarHideIcon />
        <HoverDetail label="Hide sidebar" />
      </button>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search practices"
        className={controlClass}
      >
        <SearchIcon />
        {q && (
          <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
        <HoverDetail label="Search practices" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <PracticeTagManager
          initialTags={managedTags}
          isCoach={isCoach}
          activeTags={tags}
          onTagsChange={onTagsChange}
        />
        <SettingsPopover prefs={prefs} isCoach={isCoach} />
        {isCoach && (
          <Link
            href="/practices/new"
            aria-label="New practice"
            className={controlClass + " border-0 bg-primary text-primary-text hover:bg-primary-hover"}
          >
            <PlusIcon />
            <HoverDetail label="New practice" />
          </Link>
        )}
      </div>
    </div>
  )
}
