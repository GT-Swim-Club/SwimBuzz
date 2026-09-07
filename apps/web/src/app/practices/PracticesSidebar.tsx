"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { usePracticePrefs } from "./usePracticePrefs"
import PracticesToolbar from "./PracticesToolbar"
import WeekRail from "./WeekRail"
import PracticeListRail from "./PracticeListRail"
import {
  buildWorkspaceHref,
  formatDayParam,
  parseTags,
  parseWeekStart,
  startOfUtcWeek,
  type PracticeRailItem,
} from "./workspace-params"

const MIN_WIDTH = 310
const MAX_WIDTH_FRACTION = 1 / 2

function readTagsFromParams(searchParams: URLSearchParams): string[] {
  return parseTags(searchParams.getAll("tag"))
}

function subscribeMediaQuery(query: string) {
  return (callback: () => void) => {
    const mql = window.matchMedia(query)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
  }
}

function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMediaQuery(query), [query])
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  const getServerSnapshot = useCallback(() => false, [])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export default function PracticesSidebar({
  isCoach,
  managedTags,
  practices,
  children,
}: {
  isCoach: boolean
  managedTags: { id: string; name: string }[]
  practices: PracticeRailItem[]
  children: ReactNode
}) {
  const prefs = usePracticePrefs()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const draggingRef = useRef(false)

  // Tracked so the collapsed sidebar can be fully removed from the a11y/tab
  // order (matches display:none semantics) without breaking the mobile
  // layout, where the same aside is shown/hidden by a different rule
  // (whether a practice is selected) and md: opacity/width utilities don't
  // apply. Also drives skipping the collapse/expand transition for
  // prefers-reduced-motion, per this codebase's existing convention.
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const asideCollapsed = isDesktop && !prefs.sidebarOpen

  useEffect(() => {
    if (!isDesktop) return
    const sidebar = sidebarRef.current
    const scroller = document.getElementById("page-scroll")
    if (!sidebar || !scroller) return

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return
      event.preventDefault()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? scroller.clientHeight
        : event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? parseFloat(getComputedStyle(sidebar).lineHeight) || 16
          : 1
      scroller.scrollBy({ top: event.deltaY * unit, behavior: "instant" })
    }
    sidebar.addEventListener("wheel", onWheel, { passive: false })
    return () => sidebar.removeEventListener("wheel", onWheel)
  }, [isDesktop])

  useEffect(() => {
    if (!isDesktop) return
    const container = containerRef.current
    const parent = container?.parentElement
    const scroller = document.getElementById("page-scroll")
    if (!container || !parent || !scroller) return

    // Account for the responsive header and the page wrapper's bottom padding.
    const updateHeight = () => {
      const scrollerTop = scroller.getBoundingClientRect().top
      const top = container.getBoundingClientRect().top - scrollerTop + scroller.scrollTop
      const bottomPadding = parseFloat(getComputedStyle(parent).paddingBottom) || 0
      container.style.setProperty("--workspace-top", `${top}px`)
      container.style.setProperty("--workspace-offset", `${scrollerTop + top + bottomPadding}px`)
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(parent)
    observer.observe(scroller)
    const nav = document.querySelector("nav")
    if (nav) observer.observe(nav)
    window.addEventListener("resize", updateHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateHeight)
      container.style.removeProperty("--workspace-offset")
      container.style.removeProperty("--workspace-top")
    }
  }, [isDesktop])

  const selectedSlug =
    pathname === "/practices" ? undefined : decodeURIComponent(pathname.replace(/^\/practices\//, ""))
  const selectedDayKey = selectedSlug
    ? practices.find((p) => (p.slug ?? p.id) === selectedSlug)?.dayKey
    : undefined

  // tags only affect what the sidebar shows, never the currently open
  // practice, so they're tracked as local state (seeded from the URL) instead
  // of read live from useSearchParams(). Updates below go through
  // window.history.replaceState rather than next/navigation's router: a
  // router-driven update — even one that only changes the query string —
  // makes Next refetch the current route's RSC payload (re-running the
  // detail DB query for no reason), which is what made switching weeks slow.
  const [tags, setTags] = useState<string[]>(() => readTagsFromParams(searchParams))

  // Re-sync when a real Next.js navigation changes this (e.g. picking a day
  // with a practice in the month popover, which changes tags together with
  // the selected practice). Adjusted during render rather than in an effect
  // (React's recommended pattern for resetting state from a changed prop) —
  // useSearchParams() returns a new, referentially-stable-per-navigation
  // instance, so comparing by reference reliably detects a real navigation.
  const [prevSearchParams, setPrevSearchParams] = useState(searchParams)
  if (searchParams !== prevSearchParams) {
    setPrevSearchParams(searchParams)
    setTags(readTagsFromParams(searchParams))
  }

  const updateTags = useCallback(
    (next: string[]) => {
      setTags(next)
      const href = buildWorkspaceHref(pathname, { tags: next })
      window.history.replaceState(window.history.state, "", href)
    },
    [pathname]
  )

  // The displayed week is never part of the URL: it's local, ephemeral view
  // state. It defaults to (and snaps back to, whenever a different day's
  // practice loads) the week containing the currently open practice, falling
  // back to today's week when nothing is selected — not whatever week the
  // user happened to be browsing before.
  const [week, setWeek] = useState<string>(() => {
    const weekStart = (selectedDayKey ? parseWeekStart(selectedDayKey) : null) ?? startOfUtcWeek(new Date())
    return formatDayParam(weekStart)
  })

  // Adjusted during render (see the tags sync above for why) rather than in
  // an effect — selectedDayKey is a plain string, so reference/value
  // comparison is unambiguous here.
  const [prevSelectedDayKey, setPrevSelectedDayKey] = useState(selectedDayKey)
  if (selectedDayKey !== prevSelectedDayKey) {
    setPrevSelectedDayKey(selectedDayKey)
    const weekStart = selectedDayKey ? parseWeekStart(selectedDayKey) : null
    if (weekStart) setWeek(formatDayParam(weekStart))
  }

  // The search box is plain client-side filtering (like the roster and meet
  // signup pages) — not URL/router state — so typing never touches the
  // network or the address bar.
  const [query, setQuery] = useState("")

  const filteredPractices = useMemo(() => {
    const qLower = query.trim().toLowerCase()
    return practices.filter((p) => {
      if (tags.length && !p.tags.some((t) => tags.includes(t))) return false
      if (qLower && !p.searchText.includes(qLower)) return false
      return true
    })
  }, [practices, query, tags])

  const practicesByDay = useMemo(() => {
    const map: Record<string, PracticeRailItem[]> = {}
    for (const practice of filteredPractices) {
      ;(map[practice.dayKey] ??= []).push(practice)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    }
    return map
  }, [filteredPractices])

  const emptyListMessage =
    query || tags.length
      ? "No practices match your search."
      : isCoach
        ? "No practices yet. Create one to get started."
        : "No practices posted yet."

  const effectiveWidth = dragWidth ?? prefs.sidebarWidth

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      // Non-resizable horizontal space: the 6px divider track plus the grid's
      // own column gap on both sides of it (md:gap-5) — both eat into
      // rect.width alongside the two resizable columns, so they have to be
      // subtracted before splitting the remainder for an accurate 50/50 max.
      const gap = parseFloat(getComputedStyle(containerRef.current).columnGap) || 0
      const overhead = 6 + gap * 2
      const maxWidth = Math.max(
        MIN_WIDTH,
        Math.min((rect.width - overhead) * MAX_WIDTH_FRACTION, rect.width - overhead - 400)
      )
      const raw = event.clientX - rect.left
      setDragWidth(Math.min(maxWidth, Math.max(MIN_WIDTH, raw)))
    }
    function onUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      setDragWidth((current) => {
        if (current != null) prefs.setSidebarWidth(current)
        return null
      })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showAsideMobile = !selectedSlug
  // Always three grid tracks (sidebar / divider / detail) so the browser can
  // interpolate the column widths on open/close — collapsing to a single
  // "1fr" track would change the track count and just snap instead of
  // animating. Width changes from dragging the divider stay untransitioned
  // (dragWidth != null) so resizing doesn't lag behind the pointer.
  const gridStyle = {
    gridTemplateColumns: prefs.sidebarOpen
      ? `${effectiveWidth}px 6px minmax(0,1fr)`
      : "0px 0px minmax(0,1fr)",
    transition:
      dragWidth != null || reduceMotion ? undefined : "grid-template-columns 250ms ease-in-out",
  }

  return (
    <div
      ref={containerRef}
      className="flex w-full flex-1 flex-col gap-4 md:grid md:items-stretch md:gap-5"
      style={gridStyle}
    >
      <aside
        ref={sidebarRef}
        aria-hidden={asideCollapsed || undefined}
        inert={asideCollapsed || undefined}
        className={
          (showAsideMobile ? "flex" : "hidden") +
          " md:flex sticky top-24 h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-3 overflow-hidden transition-opacity duration-150 motion-reduce:transition-none md:top-[var(--workspace-top,6rem)] md:h-[calc(100dvh-var(--workspace-offset,9rem))] md:self-start" +
          (prefs.sidebarOpen ? "" : " md:pointer-events-none md:opacity-0")
        }
      >
        <PracticesToolbar
          isCoach={isCoach}
          managedTags={managedTags}
          prefs={prefs}
          q={query}
          onQueryChange={setQuery}
          tags={tags}
          onTagsChange={updateTags}
        />
        {prefs.view === "week" ? (
          <WeekRail
            weekParam={week}
            practicesByDay={practicesByDay}
            selectedSlug={selectedSlug}
            selectedDayKey={selectedDayKey}
            tags={tags}
            monThuOnly={prefs.monThuOnly}
            sidebarWidth={effectiveWidth}
            onWeekChange={setWeek}
          />
        ) : (
          <PracticeListRail
            practices={filteredPractices}
            selectedSlug={selectedSlug}
            sort={prefs.sort}
            tags={tags}
            emptyMessage={emptyListMessage}
          />
        )}
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-hidden={asideCollapsed || undefined}
        inert={asideCollapsed || undefined}
        onPointerDown={(e) => {
          if (!prefs.sidebarOpen) return
          e.preventDefault()
          draggingRef.current = true
          setDragWidth(effectiveWidth)
        }}
        className={
          "hidden overflow-hidden transition-opacity duration-150 motion-reduce:transition-none md:flex md:items-stretch md:justify-center" +
          (prefs.sidebarOpen ? " md:cursor-col-resize md:hover:bg-fill-secondary" : " md:pointer-events-none md:opacity-0")
        }
      >
        <span className="w-px bg-border-secondary" aria-hidden />
      </div>

      <div
        className={
          (selectedSlug ? "flex" : "hidden") +
          " min-w-0 flex-1 flex-col gap-5 md:flex md:w-full"
        }
      >
        {!prefs.sidebarOpen && (
          <button
            type="button"
            onClick={() => prefs.setSidebarOpen(true)}
            className="hidden w-fit items-center gap-1.5 rounded-lg border border-border-secondary bg-background px-3 py-2 text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground md:inline-flex"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
            </svg>
            Show sidebar
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
