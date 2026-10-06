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
import HoverDetail from "@/components/ui/HoverDetail"
import PracticesToolbar from "./PracticesToolbar"
import WeekRail from "./WeekRail"
import PracticeListRail from "./PracticeListRail"
import DeletedPracticeListRail from "./DeletedPracticeListRail"
import {
  buildWorkspaceHref,
  formatDayParam,
  parseTags,
  parseWeekStart,
  startOfUtcWeek,
  type DeletedPracticeRailItem,
  type PracticeRailItem,
} from "./workspace-params"

const MIN_WIDTH = 310
// Below md, the sidebar is a slide-over drawer instead of a resizable grid
// column, so it has its own fixed width rather than reading prefs.sidebarWidth.
const MOBILE_DRAWER_WIDTH = 320
const MAX_WIDTH_FRACTION = 1 / 2
// Dragging the divider past this point previews a fully collapsed sidebar
// (width snaps to 0) instead of shrinking below MIN_WIDTH; dragging back
// past it before releasing snaps the preview back open at MIN_WIDTH. Only
// releasing while past the threshold commits the collapse.
const COLLAPSE_THRESHOLD = MIN_WIDTH / 2
// Below this pointer travel, a divider press is treated as a click (toggle
// open/closed) rather than a resize/collapse drag.
const CLICK_MOVE_THRESHOLD = 4

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

function matchesSearch(item: { tags: string[]; searchText: string }, tags: string[], qLower: string): boolean {
  if (tags.length && !item.tags.some((t) => tags.includes(t))) return false
  if (qLower && !item.searchText.includes(qLower)) return false
  return true
}

function SidebarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

export default function PracticesSidebar({
  isCoach,
  managedTags,
  practices,
  deletedPractices,
  children,
}: {
  isCoach: boolean
  managedTags: { id: string; name: string }[]
  practices: PracticeRailItem[]
  deletedPractices: DeletedPracticeRailItem[]
  children: ReactNode
}) {
  const prefs = usePracticePrefs()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const containerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const draggingRef = useRef(false)
  const dragCollapsedRef = useRef(false)
  const pointerDownXRef = useRef(0)
  const movedRef = useRef(false)

  // Tracked so the collapsed sidebar can be fully removed from the a11y/tab
  // order (matches display:none semantics) without breaking the mobile
  // layout, where the desktop <aside> is hidden outright (the sidebar there
  // is a separate slide-over drawer, not the same element) and md:
  // opacity/width utilities don't apply. Also drives skipping the
  // collapse/expand transition for prefers-reduced-motion, per this
  // codebase's existing convention.
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const asideCollapsed = isDesktop && !prefs.sidebarOpen

  // The sidebar below md is a slide-over drawer with its own open/closed
  // state, independent of prefs.sidebarOpen (which only governs the desktop
  // push/collapse layout) — toggled by a dedicated mobile button rather than
  // persisted, since it's transient overlay state like the main mobile nav
  // menu, not a layout preference.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Close the drawer on navigation (e.g. tapping a practice in the list)
  // rather than in an effect, so it never lingers visible for a frame over
  // the newly-loaded route. Same adjust-during-render pattern as the tags/week
  // syncs below.
  const [prevMobilePathname, setPrevMobilePathname] = useState(pathname)
  if (pathname !== prevMobilePathname) {
    setPrevMobilePathname(pathname)
    if (mobileSidebarOpen) setMobileSidebarOpen(false)
  }

  // Resizing (or rotating) past the desktop breakpoint while the drawer is
  // open shouldn't leave it primed to reappear if the viewport shrinks again.
  // Adjusted during render (see the tags sync above) rather than in an effect.
  if (isDesktop && mobileSidebarOpen) setMobileSidebarOpen(false)

  useEffect(() => {
    if (!mobileSidebarOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileSidebarOpen(false)
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [mobileSidebarOpen])

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
    const sidebar = sidebarRef.current
    if (!container || !parent || !scroller || !sidebar) return

    // Account for the responsive header and the page wrapper's bottom padding.
    const updateHeight = () => {
      const scrollerTop = scroller.getBoundingClientRect().top
      const top = container.getBoundingClientRect().top - scrollerTop + scroller.scrollTop
      const bottomPadding = parseFloat(getComputedStyle(parent).paddingBottom) || 0
      const sidebarRect = sidebar.getBoundingClientRect()
      container.style.setProperty("--sidebar-left", `${sidebarRect.left}px`)
      container.style.setProperty("--sidebar-width", `${sidebarRect.width}px`)
      container.style.setProperty("--sidebar-top", `${scrollerTop + top}px`)
      container.style.setProperty("--workspace-top", `${top}px`)
      container.style.setProperty("--workspace-offset", `${scrollerTop + top + bottomPadding}px`)
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(sidebar)
    observer.observe(parent)
    observer.observe(scroller)
    const nav = document.querySelector("nav")
    if (nav) observer.observe(nav)
    window.addEventListener("resize", updateHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateHeight)
      container.style.removeProperty("--sidebar-left")
      container.style.removeProperty("--sidebar-width")
      container.style.removeProperty("--sidebar-top")
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
    return practices.filter((p) => matchesSearch(p, tags, qLower))
  }, [practices, query, tags])

  const filteredDeletedPractices = useMemo(() => {
    const qLower = query.trim().toLowerCase()
    return deletedPractices.filter((p) => matchesSearch(p, tags, qLower))
  }, [deletedPractices, query, tags])

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

  const emptyDeletedMessage =
    query || tags.length ? "No deleted practices match your search." : "Trash is empty."

  const effectiveWidth = dragWidth ?? prefs.sidebarWidth
  // While dragging, the preview width decides visibility (0 = collapsed
  // preview), so dragging out from a collapsed sidebar reveals it live.
  const sidebarShown = dragWidth != null ? dragWidth > 0 : prefs.sidebarOpen

  // The pointer listeners below are bound once, so they read prefs through
  // a ref — capturing `prefs` directly would freeze sidebarOpen at its
  // first-render value.
  const prefsRef = useRef(prefs)
  useEffect(() => {
    prefsRef.current = prefs
  })

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return
      if (Math.abs(event.clientX - pointerDownXRef.current) > CLICK_MOVE_THRESHOLD) {
        movedRef.current = true
      }
      // Until the pointer actually travels, a press on a collapsed divider
      // might still be a click, so don't start previewing it open yet.
      if (!movedRef.current) return
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
      if (raw < COLLAPSE_THRESHOLD) {
        dragCollapsedRef.current = true
        setDragWidth(0)
      } else {
        dragCollapsedRef.current = false
        setDragWidth(Math.min(maxWidth, Math.max(MIN_WIDTH, raw)))
      }
    }
    function onUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      const prefs = prefsRef.current
      // A press-release with negligible pointer travel is a click: toggle
      // open/closed instead of committing a resize/collapse-preview.
      if (!movedRef.current) {
        dragCollapsedRef.current = false
        setDragWidth(null)
        prefs.setSidebarOpen(!prefs.sidebarOpen)
        return
      }
      if (dragCollapsedRef.current) {
        dragCollapsedRef.current = false
        setDragWidth(null)
        prefs.setSidebarOpen(false)
        return
      }
      // Committing a drag both saves the width and opens the sidebar, which
      // covers dragging it out from collapsed.
      setDragWidth((current) => {
        if (current != null) prefs.setSidebarWidth(current)
        return null
      })
      prefs.setSidebarOpen(true)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [])

  // Shared between the desktop <aside> (which sizes it to the resizable
  // column width) and the mobile slide-over drawer (which uses a fixed
  // width) so the toolbar/rail markup isn't duplicated between the two.
  function renderSidebarContent(width: number) {
    return (
      <>
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
            cardLabel={prefs.cardLabel}
            sidebarWidth={width}
            onWeekChange={setWeek}
          />
        ) : prefs.view === "deleted" && isCoach ? (
          <DeletedPracticeListRail
            practices={filteredDeletedPractices}
            selectedSlug={selectedSlug}
            tags={tags}
            sort={prefs.sort}
            emptyMessage={emptyDeletedMessage}
          />
        ) : (
          <PracticeListRail
            practices={filteredPractices}
            selectedSlug={selectedSlug}
            sort={prefs.sort}
            tags={tags}
            cardLabel={prefs.cardLabel}
            emptyMessage={emptyListMessage}
          />
        )}
      </>
    )
  }

  // Always three grid tracks (sidebar / divider / detail) so the browser can
  // interpolate the column widths on open/close — collapsing to a single
  // "1fr" track would change the track count and just snap instead of
  // animating. Width changes from dragging the divider stay untransitioned
  // (dragWidth != null) so resizing doesn't lag behind the pointer.
  const gridStyle = {
    // The divider's 6px track stays even when collapsed, so it remains a
    // clickable sliver that can reopen the sidebar (only the sidebar's own
    // track collapses to 0).
    gridTemplateColumns: sidebarShown ? `${effectiveWidth}px 6px minmax(0,1fr)` : "0px 6px minmax(0,1fr)",
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
          "hidden md:flex sticky top-24 h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-3 overflow-hidden transition-opacity duration-150 motion-reduce:transition-none md:top-[var(--workspace-top,6rem)] md:h-[calc(100dvh-var(--workspace-offset,9rem))] md:self-start" +
          (sidebarShown ? "" : " md:pointer-events-none md:opacity-0")
        }
      >
        {/* Keep the grid slot, but pin its contents independently of page bounce. */}
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden md:fixed md:left-[var(--sidebar-left)] md:top-[var(--sidebar-top)] md:h-[calc(100dvh-var(--workspace-offset,9rem))] md:w-[var(--sidebar-width)]">
          {renderSidebarContent(effectiveWidth)}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={prefs.sidebarOpen ? "Hide sidebar. Drag to resize." : "Show sidebar. Drag to open."}
        onPointerDown={(e) => {
          e.preventDefault()
          pointerDownXRef.current = e.clientX
          movedRef.current = false
          draggingRef.current = true
          if (prefs.sidebarOpen) setDragWidth(effectiveWidth)
        }}
        className="hidden overflow-hidden transition-opacity duration-150 motion-reduce:transition-none md:flex md:items-stretch md:justify-center md:cursor-col-resize md:hover:bg-fill-secondary"
      >
        <span className="w-px bg-border-secondary" aria-hidden />
        <HoverDetail offset={16} followPointer placement="right" className="rounded-xl">
          <div className="flex flex-col gap-0.5 px-0.5 py-1">
            <span className="text-sm font-medium text-foreground">{prefs.sidebarOpen ? "Hide sidebar" : "Show sidebar"}</span>
            <span className="text-[13px] font-normal text-foreground-secondary">
              {prefs.sidebarOpen ? "Drag to resize" : "Drag to open"}
            </span>
          </div>
        </HoverDetail>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5 md:w-full">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border-secondary bg-background px-3 py-2 text-[13px] font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-foreground md:hidden"
        >
          <SidebarIcon />
          Practices
        </button>
        {children}
      </div>

      {!isDesktop && mobileSidebarOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close practices"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Practices"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col gap-3 bg-background-elevated p-3 shadow-xl"
          >
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-foreground">Practices</p>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close practices"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground-secondary hover:bg-fill-secondary"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
              {renderSidebarContent(MOBILE_DRAWER_WIDTH)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
