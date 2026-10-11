"use client"

import { createContext, useContext, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import LiveSearch from "@/components/ui/LiveSearch"

/** The search field's narrowest width before it collapses to a button. */
const SEARCH_MIN = 200
/** Matches the toolbar's `gap-3`. */
const GAP = 12
/** The collapsed search button (and each condensed dropdown). */
const ICON_BUTTON = 42

const CondensedContext = createContext(false)

/** Whether the dropdowns should show as icon-only buttons (see MeetsToolbar). */
export function useToolbarCondensed() {
  return useContext(CondensedContext)
}

const PLACEHOLDER = "Search meets…"
const searchClass =
  "h-[42px] min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-foreground-tertiary"
const iconButtonClass =
  "group relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill-secondary"

/**
 * Search field + `controls` (selects, layout toggle, New meet). While the
 * field fits beside the controls it stays inline; once it doesn't, it collapses
 * to a search button that swaps the row for a back button and a full-width
 * field — the same pattern as the practices toolbar. Leaving search clears it.
 *
 * If even the search button + controls can't share one row, the dropdowns
 * condense to icon-only buttons too (useToolbarCondensed).
 *
 * Fit is measured from the controls' full widths — dropdowns report theirs
 * through a hidden `[data-measure]` copy — never from the row's current
 * wrapping or which mode is showing, so neither switch can flip-flop.
 */
export default function MeetsToolbar({ controls }: { controls: ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = searchParams.get("q")?.trim() ?? ""
  const rowRef = useRef<HTMLDivElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const [condensed, setCondensed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(Boolean(query))
  const [, startTransition] = useTransition()

  useLayoutEffect(() => {
    const row = rowRef.current
    const group = controlsRef.current
    if (!row || !group) return
    const measure = () => {
      const items = [...group.children].filter(
        (el): el is HTMLElement => el instanceof HTMLElement && !el.dataset.searchToggle && el.offsetWidth > 0
      )
      const fullWidth = (el: HTMLElement) => el.querySelector<HTMLElement>("[data-measure]")?.offsetWidth ?? el.offsetWidth
      const natural = items.reduce((sum, el) => sum + fullWidth(el), 0) + GAP * Math.max(0, items.length - 1)
      setCompact(row.clientWidth < SEARCH_MIN + GAP + natural)
      setCondensed(row.clientWidth < ICON_BUTTON + GAP + natural)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    observer.observe(group)
    return () => observer.disconnect()
  }, [])

  function closeSearch() {
    setSearchOpen(false)
    if (!query) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete("q")
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `/meets?${qs}` : "/meets"))
  }

  const searching = compact && searchOpen

  return (
    <div ref={rowRef} className="relative flex flex-wrap items-center gap-3">
      {searching && (
        <>
          <button type="button" onClick={closeSearch} aria-label="Exit search" className={iconButtonClass}>
            <AppIcon name="arrowLeft" className="h-4 w-4" />
            <HoverDetail label="Exit search" />
          </button>
          <LiveSearch pathname="/meets" placeholder={PLACEHOLDER} autoFocus className={`flex-1 ${searchClass}`} />
        </>
      )}
      {!compact && (
        <LiveSearch pathname="/meets" placeholder={PLACEHOLDER} className={`min-w-[200px] flex-1 ${searchClass}`} />
      )}
      {/* Stays mounted while searching (hidden and inert) so it can still be
          measured — widening the window must be able to bring the field back. */}
      <div
        ref={controlsRef}
        inert={searching}
        className={
          searching
            ? "pointer-events-none invisible absolute left-0 top-0 flex items-center gap-3"
            : // Collapsed, the controls own the row: search button on the left,
              // the rest pushed to the right edge (like the practices toolbar).
              `flex max-w-full flex-wrap items-center gap-3 ${compact ? "flex-1" : ""}`
        }
      >
        {compact && (
          <button
            type="button"
            data-search-toggle
            onClick={() => setSearchOpen(true)}
            aria-label="Search meets"
            className={`mr-auto ${iconButtonClass}`}
          >
            <AppIcon name="search" className="h-4 w-4" />
            {query && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
            <HoverDetail label="Search meets" />
          </button>
        )}
        <CondensedContext.Provider value={condensed}>{controls}</CondensedContext.Provider>
      </div>
    </div>
  )
}
