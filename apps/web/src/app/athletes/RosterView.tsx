"use client"

import { useMemo, useOptimistic, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { formatSeasonLabel } from "@swimbuzz/shared"
import FluidToolbar from "@/components/ui/FluidToolbar"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import RosterFilterMenu from "./RosterFilterMenu"
import ShareRosterButton from "./ShareRosterButton"
import { ALL_SEASONS, matchesRosterFilters, matchesRosterSearch, readRosterFilters, rosterFiltersActive } from "@/lib/roster/roster-filters"
import JumpRail, { JUMP_RAIL_LAYOUT_CLASS, JUMP_RAIL_LETTERS } from "@/components/ui/JumpRail"
import { ListLayoutToggle, useListLayout } from "@/components/ui/ListLayout"
import { athletePath } from "@/lib/slug"
import { athleteAge } from "@/lib/utils"
import AthleteGalleryCard from "./AthleteGalleryCard"
import { RosterResultsSkeleton } from "./RosterSkeleton"
import {
  AthleteAvatar,
  AthleteName,
  athleteMeta,
  athleteYear,
  genderLabel,
  type RosterAthlete,
} from "./roster-athlete"

/**
 * Header and rows share these tracks; below md only the Athlete column shows. Clearance and
 * SwimCloud status are icons beside each name (see AthleteName), not columns.
 */
const LIST_COLS = {
  withGender: "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2.5fr)_minmax(5.5rem,0.7fr)_minmax(6rem,0.55fr)_minmax(3.5rem,0.5fr)]",
  withoutGender: "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2.5fr)_minmax(6rem,0.55fr)_minmax(3.5rem,0.5fr)]",
}

type Row = { athlete: RosterAthlete; isYou: boolean; anchor?: string }

/**
 * Roster toolbar and results. The page loads the whole season (all genders), or every season,
 * so the filters (gender; staff: clearance and SwimCloud status) and search are
 * applied here and only rewrite the URL in place; changing season navigates for
 * a fresh server query — the dropdown shows the new season at once, with a skeleton
 * in place of the results until it loads.
 */
export default function RosterView({
  athletes,
  seasons,
  season,
  viewerAthleteId,
  showStatus,
  actions,
}: {
  /** Sorted by last name, then first name. */
  athletes: RosterAthlete[]
  seasons: string[]
  /** null = All seasons (`season=all`). */
  season: string | null
  viewerAthleteId: string | null
  /** Staff: clearance & SwimCloud status icons beside each name (everyone sees their own). */
  showStatus: boolean
  /** Staff-only import/add buttons. */
  actions?: ReactNode
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { layout } = useListLayout()
  const [loadingSeason, startSeasonChange] = useTransition()
  // The season just picked, until its roster arrives and `season` catches up.
  const [shownSeason, showSeason] = useOptimistic(season ?? ALL_SEASONS)

  const filters = readRosterFilters(searchParams, showStatus)
  const { gender, clearance, swimcloud } = filters
  const filtering = rosterFiltersActive(filters)
  const query = searchParams.get("q")?.trim() ?? ""
  const showGender = gender === "all"

  function rosterHref(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("year")
    // Filters drop out of the URL when back to "all".
    if (value === "all" && key !== "season") params.delete(key)
    else params.set(key, value)
    return `/athletes?${params.toString()}`
  }

  function setFilter(key: string, value: string) {
    window.history.replaceState(null, "", rosterHref(key, value))
  }

  function setSeason(value: string) {
    startSeasonChange(() => {
      showSeason(value)
      router.push(rosterHref("season", value))
    })
  }

  const pool = useMemo(
    () => athletes.filter((a) => matchesRosterFilters(a, { gender, clearance, swimcloud })),
    [athletes, gender, clearance, swimcloud]
  )

  const rows = useMemo<Row[]>(() => {
    const matches = pool.filter((a) => matchesRosterSearch(a, query))
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

  const railItems = useMemo(() => {
    const letters = new Set(rows.flatMap((r) => (r.anchor ? [r.anchor] : [])))
    return JUMP_RAIL_LETTERS.map((letter) => ({
      key: letter,
      label: letter,
      targetId: letters.has(letter) ? letter : undefined,
    }))
  }, [rows])

  return (
    <>
      <FluidToolbar
        pathname="/athletes"
        placeholder={loadingSeason ? "Search athletes…" : `Search ${pool.length} athletes…`}
        searchLabel="Search athletes"
        shallow
        controls={
          <>
            <ToolbarSelect
              label="Season"
              icon="calendar"
              current={shownSeason === ALL_SEASONS ? "All seasons" : formatSeasonLabel(shownSeason)}
              active={false}
              value={shownSeason}
              onChange={setSeason}
            >
              <option value={ALL_SEASONS}>All seasons</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {formatSeasonLabel(s)}
                </option>
              ))}
            </ToolbarSelect>
            {/* Athletes only filter by gender, so they keep the plain dropdown; staff get the Filters menu. */}
            {showStatus ? (
              <RosterFilterMenu filters={filters} staff onChange={setFilter} />
            ) : (
              <ToolbarSelect
                label="Gender"
                icon="roster"
                current={gender === "all" ? "All" : genderLabel(gender)}
                active={gender !== "all"}
                value={gender}
                onChange={(v) => setFilter("gender", v)}
              >
                <option value="all">All</option>
                <option value="M">Men</option>
                <option value="F">Women</option>
              </ToolbarSelect>
            )}
            <ListLayoutToggle />
            <ShareRosterButton season={season} filters={filters} query={query} />
            {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
          </>
        }
      />

      {loadingSeason ? (
        <div aria-busy="true" aria-label="Loading roster">
          <RosterResultsSkeleton layout={layout} />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border-secondary bg-background px-4 py-12 text-center text-sm text-foreground-secondary">
          {query
            ? `No athletes matching “${query}”.`
            : filtering
              ? "No athletes match these filters."
              : season
                ? "No athletes found for this season."
                : "No athletes found."}
        </div>
      ) : (
        // The A–Z rail sits just right of the list, out in the page's right margin as far as it
        // fits (see JumpRail) — keep in step with RosterSkeleton.
        <div className={JUMP_RAIL_LAYOUT_CLASS}>
          <div className="min-w-0 flex-1">
            {layout === "list" ? (
              <RosterTable rows={rows} showGender={showGender} showStatus={showStatus} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(max(240px,calc((100%_-_2.25rem)/4)),1fr))] gap-3">
                {rows.map((r) => (
                  <AthleteGalleryCard
                    key={r.athlete.id}
                    athlete={r.athlete}
                    showGender={showGender}
                    isYou={r.isYou}
                    anchor={r.anchor}
                    showStatus={showStatus || r.isYou}
                  />
                ))}
              </div>
            )}
          </div>
          <JumpRail label="Jump to letter" items={railItems} />
        </div>
      )}
    </>
  )
}

function RosterTable({ rows, showGender, showStatus }: { rows: Row[]; showGender: boolean; showStatus: boolean }) {
  const cols = showGender ? LIST_COLS.withGender : LIST_COLS.withoutGender
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div
        className={`grid gap-4 px-4 py-2.5 text-xs font-medium uppercase leading-4 tracking-[0.14em] text-foreground-tertiary sm:px-6 ${cols}`}
      >
        <span>Athlete</span>
        {showGender && <span className="hidden md:block">Gender</span>}
        <span className="hidden md:block">Year</span>
        <span className="hidden text-center md:block">Age</span>
      </div>
      {rows.map(({ athlete, isYou, anchor }) => {
        const age = athleteAge(athlete.dob)
        const meta = athleteMeta(athlete, showGender)
        return (
          <Link
            key={athlete.id}
            id={anchor}
            href={athletePath(athlete.slug ?? athlete.id)}
            className={`group grid items-center gap-4 border-t border-border px-4 py-2.5 text-base leading-[22px] text-foreground-secondary transition-colors hover:bg-background-hover sm:px-6 ${cols} ${
              isYou ? "bg-primary/5" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <AthleteAvatar athlete={athlete} className="h-9 w-9 text-[13px]" />
              <div className="flex min-w-0 flex-col">
                <AthleteName athlete={athlete} className="text-[17px] leading-6" showStatus={showStatus || isYou} />
                {meta && (
                  <p className="truncate text-[13px] leading-[18px] tabular-nums md:hidden">{meta}</p>
                )}
              </div>
            </div>
            {showGender && <span className="hidden md:block">{genderLabel(athlete.gender)}</span>}
            <span className="hidden truncate md:block">{athleteYear(athlete) ?? "—"}</span>
            <span className="hidden text-center tabular-nums md:block">{age ?? "—"}</span>
          </Link>
        )
      })}
    </div>
  )
}
