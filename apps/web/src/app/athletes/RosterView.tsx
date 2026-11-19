"use client"

import { useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { daysAgoLabel, formatDateTime, formatSeasonLabel } from "@swimbuzz/shared"
import FluidToolbar from "@/components/ui/FluidToolbar"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { useTodayKey } from "@/components/ui/RelativeDate"
import { ListLayoutToggle, useListLayout } from "@/components/ui/ListLayout"
import { athletePath } from "@/lib/slug"
import { athleteAge } from "@/lib/utils"
import AthleteGalleryCard from "./AthleteGalleryCard"
import {
  AthleteAvatar,
  AthleteName,
  athleteMeta,
  athleteYear,
  genderLabel,
  type RosterAthlete,
} from "./roster-athlete"

type Gender = "all" | "M" | "F"

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

/**
 * Header and rows share these tracks; below md only the Athlete column (and
 * the staff-only SwimCloud column) shows.
 */
const LIST_COLS = {
  withGender: "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2.5fr)_minmax(5.5rem,0.7fr)_minmax(6rem,0.55fr)_minmax(3.5rem,0.5fr)]",
  withoutGender: "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.55fr)_minmax(3.5rem,0.5fr)]",
  staffWithGender:
    "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.5fr)_minmax(5.5rem,0.7fr)_minmax(6rem,0.55fr)_minmax(3.5rem,0.5fr)_minmax(7rem,0.7fr)_minmax(7.5rem,0.6fr)]",
  staffWithoutGender:
    "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.55fr)_minmax(3.5rem,0.5fr)_minmax(7rem,0.7fr)_minmax(7.5rem,0.6fr)]",
}

function listCols(showGender: boolean, staffColumns: boolean) {
  if (staffColumns) return showGender ? LIST_COLS.staffWithGender : LIST_COLS.staffWithoutGender
  return showGender ? LIST_COLS.withGender : LIST_COLS.withoutGender
}

type Row = { athlete: RosterAthlete; isYou: boolean; anchor?: string }

/**
 * Roster toolbar and results. The page loads the whole season (all genders),
 * so the gender filter and search are applied here and only rewrite the URL
 * in place; changing season navigates for a fresh server query.
 */
export default function RosterView({
  athletes,
  seasons,
  season,
  viewerAthleteId,
  staffColumns,
  actions,
}: {
  /** Sorted by last name, then first name. */
  athletes: RosterAthlete[]
  seasons: string[]
  season: string
  viewerAthleteId: string | null
  /** Staff-only list columns: SwimCloud profile and when times were last imported. */
  staffColumns: boolean
  /** Staff-only import/add buttons. */
  actions?: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { layout } = useListLayout()

  const rawGender = searchParams.get("gender")
  const gender: Gender = rawGender === "F" || rawGender === "M" ? rawGender : "all"
  const query = searchParams.get("q")?.trim() ?? ""
  const showGender = gender === "all"

  function setParam(key: string, value: string, navigate: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("year")
    params.set(key, value)
    const href = `/athletes?${params.toString()}`
    if (navigate) router.push(href)
    else window.history.replaceState(null, "", href)
  }

  const pool = useMemo(
    () => (gender === "all" ? athletes : athletes.filter((a) => a.gender === gender)),
    [athletes, gender]
  )

  const rows = useMemo<Row[]>(() => {
    const needle = query.toLowerCase()
    const matches = !needle
      ? pool
      : pool.filter(
          (a) =>
            `${a.firstName} ${a.lastName}`.toLowerCase().includes(needle) ||
            !!a.preferredName?.toLowerCase().includes(needle)
        )
    const viewer = matches.find((a) => a.id === viewerAthleteId)
    let prev: string | null = null
    const others = matches
      .filter((a) => a.id !== viewerAthleteId)
      .map((athlete) => {
        const letter = athlete.lastName[0]?.toUpperCase() ?? "#"
        const anchor = letter !== prev ? letter : undefined
        prev = letter
        return { athlete, isYou: false, anchor }
      })
    return viewer ? [{ athlete: viewer, isYou: true }, ...others] : others
  }, [pool, query, viewerAthleteId])

  const letters = useMemo(() => new Set(rows.flatMap((r) => (r.anchor ? [r.anchor] : []))), [rows])

  return (
    <>
      <FluidToolbar
        pathname="/athletes"
        placeholder={`Search ${pool.length} athletes…`}
        searchLabel="Search athletes"
        shallow
        controls={
          <>
            <ToolbarSelect
              label="Gender"
              icon="roster"
              current={gender === "all" ? "All" : genderLabel(gender)}
              active={gender !== "all"}
              value={gender}
              onChange={(v) => setParam("gender", v, false)}
            >
              <option value="all">All</option>
              <option value="M">Men</option>
              <option value="F">Women</option>
            </ToolbarSelect>
            <ToolbarSelect
              label="Season"
              icon="calendar"
              current={formatSeasonLabel(season)}
              active={false}
              value={season}
              onChange={(v) => setParam("season", v, true)}
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {formatSeasonLabel(s)}
                </option>
              ))}
            </ToolbarSelect>
            <ListLayoutToggle />
            {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
          </>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border-secondary bg-background px-4 py-12 text-center text-sm text-foreground-secondary">
          {query
            ? `No athletes matching “${query}”.`
            : `No athletes found for this ${showGender ? "season" : "gender and season"}.`}
        </div>
      ) : (
        // The A–Z rail sits beside the list, or out in the page's right margin once that's wide
        // enough to hold it (see LetterRail) — keep in step with RosterSkeleton.
        <div className="relative flex items-start gap-1 min-[1040px]:block">
          <div className="min-w-0 flex-1">
            {layout === "list" ? (
              <RosterTable rows={rows} showGender={showGender} staffColumns={staffColumns} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(max(240px,calc((100%_-_2.25rem)/4)),1fr))] gap-3">
                {rows.map((r) => (
                  <AthleteGalleryCard
                    key={r.athlete.id}
                    athlete={r.athlete}
                    showGender={showGender}
                    isYou={r.isYou}
                    anchor={r.anchor}
                  />
                ))}
              </div>
            )}
          </div>
          <LetterRail letters={letters} />
        </div>
      )}
    </>
  )
}

function RosterTable({
  rows,
  showGender,
  staffColumns,
}: {
  rows: Row[]
  showGender: boolean
  staffColumns: boolean
}) {
  const cols = listCols(showGender, staffColumns)
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div
        className={`grid gap-4 px-4 py-2.5 text-xs font-medium uppercase leading-4 tracking-[0.14em] text-foreground-tertiary sm:px-6 ${cols}`}
      >
        <span>Athlete</span>
        {showGender && <span className="hidden md:block">Gender</span>}
        <span className="hidden md:block">Year</span>
        <span className="hidden text-center md:block">Age</span>
        {staffColumns && <span className="text-center">SwimCloud</span>}
        {staffColumns && <span className="hidden md:block">Last import</span>}
      </div>
      {rows.map(({ athlete, isYou, anchor }) => {
        const age = athleteAge(athlete.dob)
        const meta = athleteMeta(athlete, showGender)
        return (
          <Link
            key={athlete.id}
            id={anchor}
            href={athletePath(athlete.slug ?? athlete.id)}
            className={`grid scroll-mt-32 items-center gap-4 border-t border-border px-4 py-2.5 text-base leading-[22px] text-foreground-secondary transition-colors hover:bg-background-hover sm:px-6 ${cols} ${
              isYou ? "bg-primary/5" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <AthleteAvatar athlete={athlete} className="h-9 w-9 text-[13px]" />
              <div className="flex min-w-0 flex-col">
                <AthleteName athlete={athlete} className="text-[17px] leading-6" />
                {meta && (
                  <p className="truncate text-[13px] leading-[18px] tabular-nums md:hidden">{meta}</p>
                )}
              </div>
            </div>
            {showGender && <span className="hidden md:block">{genderLabel(athlete.gender)}</span>}
            <span className="hidden truncate md:block">{athleteYear(athlete) ?? "—"}</span>
            <span className="hidden text-center tabular-nums md:block">{age ?? "—"}</span>
            {staffColumns &&
              (athlete.swimCloudIds.length > 0 ? (
                <span className="flex justify-center text-success-text">
                  <AppIcon name="check" className="h-5 w-5" />
                  <span className="sr-only">Has SwimCloud</span>
                </span>
              ) : (
                <span className="text-center text-foreground-tertiary">
                  <span aria-hidden>—</span>
                  <span className="sr-only">No SwimCloud</span>
                </span>
              ))}
            {staffColumns && (
              <LastImport at={athlete.timesSyncedAt} hasSwimCloud={athlete.swimCloudIds.length > 0} />
            )}
          </Link>
        )
      })}
    </div>
  )
}

/**
 * "3 days ago" (absolute date on hover), "Never", or a dash for athletes with no SwimCloud to
 * import from; blank until the viewer's day is known (SSR).
 */
function LastImport({ at, hasSwimCloud }: { at: string | Date | null; hasSwimCloud: boolean }) {
  const todayKey = useTodayKey()
  if (!at && !hasSwimCloud) {
    return (
      <span className="hidden text-foreground-tertiary md:block">
        <span aria-hidden>—</span>
        <span className="sr-only">No SwimCloud</span>
      </span>
    )
  }
  const label = at ? daysAgoLabel(at, todayKey) : "Never"
  return (
    <span className={`hidden truncate md:block ${at ? "" : "text-foreground-tertiary"}`}>
      {at && label ? (
        <span className="group relative inline-block">
          {label}
          <HoverDetail label={formatDateTime(at)} />
        </span>
      ) : (
        label
      )}
    </span>
  )
}

/**
 * Sticky A–Z jump list. Every letter is clickable; a letter with no athletes
 * jumps to the next letter that has some (or the last one, past the end).
 * Pressing and dragging along the rail scrubs through the letters, jumping as
 * the pointer crosses each one (like the iOS contacts index).
 */
function LetterRail({ letters }: { letters: Set<string> }) {
  const navRef = useRef<HTMLElement>(null)
  // Letter under the pointer while pressing/dragging (highlighted), or null.
  const [scrubIndex, setScrubIndex] = useState<number | null>(null)
  const scrubIndexRef = useRef<number | null>(null)

  const jumpTo = (index: number, behavior: ScrollBehavior = "smooth") => {
    const target =
      LETTERS.slice(index).find((l) => letters.has(l)) ?? LETTERS.slice(0, index).findLast((l) => letters.has(l))
    const el = target ? document.getElementById(target) : null
    const scroller = document.getElementById("page-scroll")
    if (!el || !scroller) return
    // Scroll only the page area: scrollIntoView would also scroll the body/html
    // when a late letter can't reach the top, pushing the nav off screen.
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - margin
    scroller.scrollTo({ top, behavior })
  }

  /** The letter at a pointer's height, clamped to A/Z above or below the rail. */
  const indexAt = (clientY: number) => {
    const buttons = navRef.current?.querySelectorAll<HTMLElement>("button")
    if (!buttons?.length) return null
    for (let i = 0; i < buttons.length; i++) {
      if (clientY < buttons[i].getBoundingClientRect().bottom) return i
    }
    return buttons.length - 1
  }

  const scrubTo = (clientY: number, behavior: ScrollBehavior) => {
    const index = indexAt(clientY)
    if (index == null || index === scrubIndexRef.current) return
    scrubIndexRef.current = index
    setScrubIndex(index)
    jumpTo(index, behavior)
  }

  const endScrub = () => {
    scrubIndexRef.current = null
    setScrubIndex(null)
  }

  return (
    // The slot stretches to the list's height so the nav inside can stick while scrolling. From
    // 1040px wide the page gutter (--page-gutter-x) is 38px+, room for the rail and its 12px gap,
    // so it moves out into the right margin, just beside the list, instead of narrowing it.
    <div className="shrink-0 self-stretch min-[1040px]:absolute min-[1040px]:inset-y-0 min-[1040px]:left-full min-[1040px]:ml-3">
      <nav
        ref={navRef}
        aria-label="Jump to letter"
        // touch-none so a finger drag scrubs the letters instead of scrolling the page.
        className="sticky top-2 flex touch-none select-none flex-col items-center py-1"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          // Keep receiving moves when the pointer drifts off the rail mid-drag.
          e.currentTarget.setPointerCapture(e.pointerId)
          scrubTo(e.clientY, "smooth")
        }}
        onPointerMove={(e) => {
          // Jump instantly while dragging so the list keeps up with the pointer.
          if (scrubIndexRef.current != null) scrubTo(e.clientY, "auto")
        }}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onLostPointerCapture={endScrub}
      >
        {LETTERS.map((letter, index) => (
          <button
            key={letter}
            type="button"
            // Pointer presses are handled by the rail's scrub above; this covers the keyboard.
            onClick={(e) => {
              if (e.detail === 0) jumpTo(index)
            }}
            className={`w-4 cursor-pointer rounded py-px min-[1040px]:w-5 text-center text-[11px] font-semibold leading-4 transition-colors hover:text-primary ${
              scrubIndex === index ? "text-primary" : "text-foreground-secondary"
            }`}
          >
            {letter}
          </button>
        ))}
      </nav>
    </div>
  )
}
