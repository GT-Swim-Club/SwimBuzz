"use client"
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import Link from "next/link"
import { Skeleton } from "@/components/ui/Skeleton"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import HoverDetail from "@/components/ui/HoverDetail"
import ActionIcon from "@/components/ui/ActionIcon"
import { AppIcon } from "@/components/ui/AppIcon"
import { useEscapeToClose } from "@/lib/use-escape-to-close"
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard"
import { formatSwimDate, formatTime } from "@/lib/utils"
import { parseSwimTime } from "@/lib/swim/swim-parse"
import {
  ALTERNATES_SHOWN,
  DEFAULT_RELAY_COUNT,
  RELAY_LETTERS,
  TIME_WINDOWS,
  alternateGroups,
  appendTeams,
  applyLineupTeams,
  canDropOnSlot,
  fetchOptimalRelay,
  formatLegTime,
  initialLineup,
  isMedleyRelay,
  legStroke,
  lineupKey,
  lineupTeamsOf,
  locKey,
  medleyStrokeGroups,
  moveRelayRow,
  refinedPoolFor,
  publishedTeamsFor,
  replaceLeg,
  setLegTime,
  slotTime,
  type BuildSettings,
  withPoolAthletes,
  truncateTeams,
  windowDays,
  type AthleteOption,
  type Leg,
  type LineupTeam,
  type RelayEventSlot,
  type RelayResult,
  type RelaySlotData,
  type RowLoc,
  type SignupPool,
} from "@/lib/meet/relay-builder"
import RelayPageHeader, { relayBackLinkClass, relayEyebrowClass } from "./relays/RelayPageHeader"
import type { RelayCommit } from "@/lib/meet/relay-save"

type Source = "optimal" | "published" | "draft"

type BuildRequest = {
  id: number
  settings: BuildSettings
  /** Lineup to keep and re-time; null builds the optimal lineup. */
  fixed: LineupTeam[] | null
  count: number
  /** What this build loads (marks the lineup unchanged); null keeps the current source. */
  source: Source | null
}

/** Swim date under a time (marked when it's a relay split); red when outside the preferred range. */
function SourceDate({ leg }: { leg: Leg }) {
  if (leg.custom) {
    return <span className="mt-0.5 text-[11px] text-foreground-secondary">Custom time</span>
  }
  if (!leg.sourceDate && !leg.relaySplit) return null
  return (
    <span
      className={
        "mt-0.5 text-[11px] " +
        (leg.outsideWindow ? "text-error" : "text-foreground-secondary")
      }
      title={leg.outsideWindow ? "Outside the preferred date range" : undefined}
    >
      {[leg.relaySplit && "Relay split", leg.sourceDate && formatSwimDate(leg.sourceDate)]
        .filter(Boolean)
        .join(" · ")}
    </span>
  )
}

function athleteName(athlete: AthleteOption): string {
  return athlete.name?.trim() || "Unknown"
}

function GenderTag({ gender }: { gender?: "M" | "F" }) {
  if (!gender) return null
  return (
    <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
      {gender}
    </span>
  )
}

/** Pool swimmers as relay-leg people, so those with no time can still be alternates (as NT). */
function poolPeople(pool: AthleteOption[]) {
  return pool.map((a) => ({ athleteId: a.id, name: athleteName(a), gender: a.gender }))
}

type LegCandidate = {
  athlete: AthleteOption
  timeMs: number | null
  /** Where they are now: "B · Leg 2", "Alternate", or null. */
  place: string | null
}

/** Inline roster autocomplete that replaces a relay leg's name while editing. */
function LegNameEditor({
  initialName,
  candidates,
  onPick,
  onCancel,
}: {
  initialName: string
  candidates: LegCandidate[]
  onPick: (athlete: AthleteOption) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listId = useId()
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q
      ? candidates.filter((c) => athleteName(c.athlete).toLowerCase().includes(q))
      : candidates
  }, [candidates, query])
  const highlighted = Math.min(active, Math.max(0, matches.length - 1))

  return (
    <div className="relative w-56 max-w-full">
      <input
        autoFocus
        type="text"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={matches[highlighted] ? `${listId}-${highlighted}` : undefined}
        aria-label="Swimmer"
        value={query}
        placeholder={initialName}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
        }}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive(Math.min(highlighted + 1, matches.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive(Math.max(highlighted - 1, 0))
          } else if (e.key === "Enter") {
            e.preventDefault()
            if (matches[highlighted]) onPick(matches[highlighted].athlete)
          } else if (e.key === "Escape") {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
        className="w-full rounded-md border border-primary bg-background px-2 py-1 text-sm font-medium outline-none"
      />
      <ul
        id={listId}
        role="listbox"
        // Keep focus in the input so blur doesn't cancel before a pick or scroll.
        onMouseDown={(e) => e.preventDefault()}
        className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 max-w-[80vw] overflow-auto rounded-lg border border-border bg-background-elevated py-1 shadow-lg"
      >
        {matches.length === 0 ? (
          <li className="px-3 py-2 text-sm text-foreground-secondary">No matching athletes</li>
        ) : (
          matches.map((c, i) => (
            <li
              key={c.athlete.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(c.athlete)}
              className={
                "flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm " +
                (i === highlighted ? "bg-background-hover" : "")
              }
            >
              <span className="min-w-0">
                <span className="block truncate">{athleteName(c.athlete)}</span>
                {c.place ? (
                  <span className="block text-xs text-foreground-secondary">{c.place}</span>
                ) : null}
              </span>
              <span className="shrink-0 font-mono text-xs text-foreground-secondary">
                {formatLegTime(c.timeMs)}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

/** Inline custom-time input for a relay leg. */
function LegTimeEditor({
  timeMs,
  onSave,
  onCancel,
}: {
  timeMs: number | null
  onSave: (timeMs: number) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(timeMs == null ? "" : formatTime(timeMs))
  const [invalid, setInvalid] = useState(false)

  function parsed(): number | null {
    const ms = parseSwimTime(value)
    return ms != null && Number.isFinite(ms) && ms > 0 ? ms : null
  }

  function commit(fromBlur: boolean) {
    const ms = parsed()
    if (ms == null) {
      if (fromBlur || !value.trim()) onCancel()
      else setInvalid(true)
      return
    }
    if (ms === timeMs) onCancel()
    else onSave(ms)
  }

  return (
    <input
      autoFocus
      type="text"
      inputMode="decimal"
      aria-label="Custom time"
      aria-invalid={invalid}
      value={value}
      placeholder="24.31"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        setValue(e.target.value)
        setInvalid(false)
      }}
      onBlur={() => commit(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit(false)
        } else if (e.key === "Escape") {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        }
      }}
      className={
        "w-20 rounded-md border bg-background px-2 py-0.5 text-right font-mono text-[13px] outline-none " +
        (invalid ? "border-error" : "border-primary")
      }
    />
  )
}

const fieldLabelClass = "text-xs font-medium leading-4 text-foreground-secondary"

function SettingsField({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5">
        <span className={fieldLabelClass} aria-hidden={help ? true : undefined}>
          {label}
        </span>
        {help}
      </span>
      {children}
    </div>
  )
}

/** Native select styled as a 36px control (chevron from the global select style). */
function SelectControl({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="relative inline-flex h-9 items-center rounded-lg border border-border bg-background transition-colors hover:border-border-secondary focus-within:border-primary">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // The chevron comes from the global select style in globals.css.
        className="h-full cursor-pointer bg-transparent pl-3 text-sm text-foreground outline-none"
      >
        {children}
      </select>
    </label>
  )
}

function HelpButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-grid h-4 w-4 place-items-center rounded-full border border-border text-[10px] font-semibold leading-none text-foreground-secondary transition-colors hover:bg-fill hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35"
    >
      ?
    </button>
  )
}

const iconButtonClass =
  "relative inline-grid h-9 w-9 place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"

function RelayCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-14" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between border-t border-border px-3 py-2 first:border-t-0">
          <div className="flex items-center gap-2.5">
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  )
}

const RELAY_GRID_COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
}

/** Relay lineup builder for one relay event (gender + event). */
export default function MeetRelayBuilder({
  meetId,
  meetName,
  iconUrl,
  relaysPath,
  course,
  data,
  slots,
  athletes = [],
  signupRelayPrefs = null,
  hasImportedResults = false,
  initialBase = null,
  onCommit,
  onExit,
}: {
  meetId: string
  meetName: string
  iconUrl: string | null
  relaysPath: string
  course: string
  data: RelaySlotData
  /** Every relay event, for the event picker. */
  slots: RelayEventSlot[]
  athletes?: AthleteOption[]
  /** Relay preferences by athlete id from the last sign-up import; null when none. */
  signupRelayPrefs?: Record<string, string[]> | null
  /** When true, hide "Publish" (seeds can't be added once results are in). */
  hasImportedResults?: boolean
  /**
   * Optimal result the summary already built at the default settings. Shown as-is for an event
   * with nothing saved, or used to time the draft / published lineup — so no first fetch.
   */
  initialBase?: RelayResult | null
  /** Save as draft / publish: the workspace shows the summary at once and saves in the background. */
  onCommit: (commit: RelayCommit, replaceHistory: boolean) => void
  /** Leave for the summary (`slug` null) or another event, without a server round trip. */
  onExit: (slug: string | null, replaceHistory: boolean) => void
}) {
  const { slot } = data
  const { gender, event } = slot
  const mixed = gender === "X"
  const hasSignups = signupRelayPrefs != null && Object.keys(signupRelayPrefs).length > 0
  const publishedTeams = useMemo(
    () => publishedTeamsFor(data.published, event, gender),
    [data.published, event, gender]
  )
  const draftTeams = data.draft?.teams ?? null

  const defaultSettings: BuildSettings = {
    limitDays: null,
    withinDays: null,
    signupPool: hasSignups ? "relay" : "all",
    excludedIds: [],
    addedIds: [],
  }
  const [request, setRequest] = useState<BuildRequest>(() => {
    // Open on the draft (with the settings it was saved with), else what's published, else optimal.
    const { source, fixed } = initialLineup(data)
    const settings = (source === "draft" ? data.draft?.settings : null) ?? defaultSettings
    return { id: 0, settings, fixed, count: fixed ? fixed.length : DEFAULT_RELAY_COUNT, source }
  })
  const settings = request.settings
  // The summary already ran this event's first build (same default settings) — reuse it.
  const [initial] = useState(() => {
    // The summary built at default settings; a draft saved with other settings needs its own build.
    if (!initialBase || (request.source === "draft" && data.draft?.settings)) return null
    const pool = poolPeople(refinedPoolFor(athletes, gender, event, request.settings, signupRelayPrefs).included)
    if (request.fixed) {
      return withPoolAthletes(
        applyLineupTeams(initialBase, request.fixed, new Map(athletes.map((a) => [a.id, a.gender]))),
        pool
      )
    }
    return initialBase.teams.length > 0 ? withPoolAthletes(initialBase, pool) : null
  })
  const [loading, setLoading] = useState(initial == null)
  /** New relays (C, D, …) being built from swimmers not already on a relay. */
  const [adding, setAdding] = useState(0)
  const addAbortRef = useRef<AbortController | null>(null)
  const [result, setResult] = useState<RelayResult | null>(initial)
  const [loaded, setLoaded] = useState<{ source: Source; key: string } | null>(() =>
    initial && request.source ? { source: request.source, key: lineupKey(lineupTeamsOf(initial)) } : null
  )
  /** The optimal lineup at the current settings and relay count, to compare against; null = unknown. */
  const [optimalTeams, setOptimalTeams] = useState<LineupTeam[] | null>(() =>
    initialBase && initialBase.teams.length > 0 ? lineupTeamsOf(initialBase) : null
  )
  const [error, setError] = useState("")
  /** Alternate lists expanded by "Show more", per stroke (medley) or "free". */
  const [expandedAlternates, setExpandedAlternates] = useState<Record<string, boolean>>({})
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [athleteQuery, setAthleteQuery] = useState("")
  const [athletePoolOpen, setAthletePoolOpen] = useState(false)
  const [dragFrom, setDragFrom] = useState<RowLoc | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** Relay leg whose name or time is being edited inline. */
  const [editing, setEditing] = useState<{ key: string; field: "name" | "time" } | null>(null)
  const relayRowRefs = useRef(new Map<string, HTMLDivElement>())

  useEscapeToClose(loadOpen, () => setLoadOpen(false))

  const genderPeople = gender === "F" ? "women" : gender === "M" ? "men" : "athletes"

  const {
    options: poolAthletes,
    baseIds: poolIdSet,
    included: includedAthletes,
  } = useMemo(
    () => refinedPoolFor(athletes, gender, event, settings, signupRelayPrefs),
    [athletes, gender, event, settings, signupRelayPrefs]
  )
  const includedIdSet = useMemo(() => new Set(includedAthletes.map((a) => a.id)), [includedAthletes])
  const visibleAthletes = useMemo(() => {
    const q = athleteQuery.trim().toLowerCase()
    if (!q) return poolAthletes
    return poolAthletes.filter((a) => athleteName(a).toLowerCase().includes(q))
  }, [poolAthletes, athleteQuery])

  useEffect(() => {
    const controller = new AbortController()
    const { settings: s, fixed, count, source } = request
    // First build is already done when opening from a summary suggestion.
    if (initial && request.id === 0) return
    // A full rebuild supersedes any relays still being added.
    addAbortRef.current?.abort()
    addAbortRef.current = null
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setAdding(0)
      setError("")
      const { options: pool, included: includedPool } = refinedPoolFor(athletes, gender, event, s, signupRelayPrefs)
      const included = includedPool.map((a) => a.id)
      const poolIds = s.signupPool === "all" && included.length === pool.length ? null : included
      // A kept lineup stays timed even when its swimmers are outside the current pool.
      const requestIds = poolIds
        ? [...new Set([...poolIds, ...(fixed ?? []).flatMap((t) => t.legs.map((l) => l.athleteId))])]
        : null
      if (requestIds && requestIds.length === 0) {
        setError(
          s.excludedIds.length > 0
            ? `No ${genderPeople} left in the pool. Include at least four athletes.`
            : s.signupPool === "relay"
              ? `No ${genderPeople} signed up for this relay.`
              : `No ${genderPeople} signed up for this meet.`
        )
        setResult(null)
        setLoading(false)
        return
      }
      try {
        const res = await fetchOptimalRelay(
          {
            meetId,
            event,
            course,
            gender,
            relayCount: fixed ? fixed.length : count,
            withinDays: s.withinDays,
            limitDays: s.limitDays,
            athleteIds: requestIds,
          },
          controller.signal
        )
        if (controller.signal.aborted) return
        let next: RelayResult | null = null
        if (fixed) {
          // Optimal can fail (e.g. too few timed swimmers) — still show the kept lineup, untimed.
          const base = res.ok ? res.result : { relay: event, course, teams: [], strokeTimes: {} }
          next = applyLineupTeams(base, fixed, new Map(athletes.map((a) => [a.id, a.gender])))
        } else if (res.ok) {
          next = res.result
        } else {
          setError(res.error)
        }
        setResult(next ? withPoolAthletes(next, poolPeople(includedPool)) : next)
        // Every build returns the optimal lineup too, even when re-timing a kept one.
        setOptimalTeams(res.ok && res.result.teams.length > 0 ? lineupTeamsOf(res.result) : null)
        if (next && source) setLoaded({ source, key: lineupKey(lineupTeamsOf(next)) })
      } catch {
        if (!controller.signal.aborted) setError("Something went wrong")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [request, initial, athletes, course, event, gender, genderPeople, meetId, mixed, signupRelayPrefs])

  const changed =
    result != null && loaded != null && lineupKey(lineupTeamsOf(result)) !== loaded.key
  const teamCount = result?.teams.length ?? request.count
  const guard = useUnsavedChangesGuard(changed)

  /** Rebuild with new settings, keeping the coach's lineup unless it's an untouched optimal one. */
  function updateSettings(patch: Partial<BuildSettings>) {
    const nextSettings = { ...settings, ...patch }
    const keep = result != null && result.teams.length > 0 && (loaded?.source !== "optimal" || changed)
    setRequest((r) => ({
      id: r.id + 1,
      settings: nextSettings,
      fixed: keep && result ? lineupTeamsOf(result) : null,
      count: r.count,
      source: keep ? null : "optimal",
    }))
  }

  function load(source: Source) {
    setLoadOpen(false)
    const fixed = source === "draft" ? draftTeams : source === "published" ? publishedTeams : null
    setRequest((r) => ({
      id: r.id + 1,
      settings: (source === "draft" ? data.draft?.settings : null) ?? r.settings,
      fixed,
      count: fixed ? fixed.length : teamCount,
      source,
    }))
  }

  function pickRelayCount(index: number) {
    const on = index < teamCount
    const next = Math.max(1, on ? index : index + 1)
    if (next === teamCount || !result) return
    if (next < result.teams.length) {
      setResult(truncateTeams(result, next))
      // Relays are built fastest-first, so fewer optimal relays are the first ones.
      setOptimalTeams((teams) => teams?.slice(0, next) ?? null)
      return
    }
    addRelays(result, next - result.teams.length)
  }

  /** Build `extra` more relays from swimmers not already on one, leaving the current relays alone. */
  function addRelays(current: RelayResult, extra: number) {
    const used = new Set(current.teams.flatMap((team) => team.legs.map((leg) => leg.athleteId)))
    const ids = includedAthletes.map((a) => a.id).filter((id) => !used.has(id))
    const nextLetter = RELAY_LETTERS[current.teams.length]
    if (ids.length < 4) {
      setError(`Not enough swimmers left in the pool for a ${nextLetter} relay.`)
      return
    }
    addAbortRef.current?.abort()
    const controller = new AbortController()
    addAbortRef.current = controller
    setAdding(extra)
    setError("")
    fetchOptimalRelay(
      {
        meetId,
        event,
        course,
        gender,
        relayCount: extra,
        withinDays: settings.withinDays,
        limitDays: settings.limitDays,
        athleteIds: ids,
      },
      controller.signal
    )
      .then((res) => {
        if (controller.signal.aborted) return
        if (!res.ok || res.result.teams.length === 0) {
          setError(res.ok ? `Not enough swimmers with times left for a ${nextLetter} relay.` : res.error)
          return
        }
        setResult((cur) => (cur ? appendTeams(cur, res.result) : cur))
        // The optimal lineup for the new count isn't known without a full rebuild.
        setOptimalTeams(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Something went wrong")
      })
      .finally(() => {
        if (addAbortRef.current !== controller) return
        addAbortRef.current = null
        setAdding(0)
      })
  }

  function toggleIncluded(id: string) {
    const toggle = (ids: string[]) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
    // Pool members are opted out via excludedIds; other meet signups are opted in via addedIds.
    updateSettings(poolIdSet.has(id) ? { excludedIds: toggle(settings.excludedIds) } : { addedIds: toggle(settings.addedIds) })
  }

  /** Pool athletes who could take this leg, fastest first, with where they are now. */
  function legCandidates(letter: string, index: number): LegCandidate[] {
    if (!result) return []
    const outgoing = result.teams.find((team) => team.letter === letter)?.legs[index]
    if (!outgoing) return []
    const places = new Map<string, string>()
    for (const alt of result.alternates ?? []) places.set(alt.athleteId, "Alternate")
    for (const team of result.teams) {
      team.legs.forEach((leg, i) => {
        places.set(leg.athleteId, result.teams.length > 1 ? `${team.letter} · Leg ${i + 1}` : `Leg ${i + 1}`)
      })
    }
    const stroke = legStroke(result.relay, index)
    return includedAthletes
      // Mixed relays swap like-for-like so the lineup stays two men and two women.
      .filter((a) => a.id !== outgoing.athleteId && (!mixed || a.gender === outgoing.gender))
      .map((athlete) => ({
        athlete,
        timeMs: slotTime(result.strokeTimes?.[athlete.id], stroke, index)?.timeMs ?? null,
        place: places.get(athlete.id) ?? null,
      }))
      .sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || 0)
  }

  function pickLegAthlete(letter: string, index: number, athlete: AthleteOption) {
    setEditing(null)
    const previousPositions = captureRelayRowPositions()
    setResult((current) =>
      current
        ? replaceLeg(current, letter, index, {
            athleteId: athlete.id,
            name: athleteName(athlete),
            gender: athlete.gender,
          })
        : current
    )
    animateRelayRowSwap(previousPositions)
  }

  function saveLegTime(letter: string, index: number, timeMs: number) {
    setEditing(null)
    setResult((current) => (current ? setLegTime(current, letter, index, timeMs) : current))
  }

  function captureRelayRowPositions(): Map<string, DOMRect> {
    return new Map(
      [...relayRowRefs.current].map(([athleteId, row]) => [athleteId, row.getBoundingClientRect()])
    )
  }

  function animateRelayRowSwap(previousPositions: Map<string, DOMRect>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    window.requestAnimationFrame(() => {
      for (const [athleteId, previous] of previousPositions) {
        const row = relayRowRefs.current.get(athleteId)
        if (!row) continue
        const offsetX = previous.left - row.getBoundingClientRect().left
        const offsetY = previous.top - row.getBoundingClientRect().top
        if (Math.abs(offsetX) < 1 && Math.abs(offsetY) < 1) continue
        row.getAnimations().forEach((animation) => animation.cancel())
        row.animate(
          [
            {
              transform: `translate(${offsetX}px, ${offsetY}px)`,
              backgroundColor: "color-mix(in srgb, var(--brand-color-primary) 18%, transparent)",
            },
            { transform: "translate(0, 0)", backgroundColor: "transparent" },
          ],
          { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        )
      }
    })
  }

  function endDrag() {
    setDragFrom(null)
    setDropTarget(null)
  }

  function handleRowDragStart(e: DragEvent<HTMLElement>, loc: RowLoc) {
    setDragFrom(loc)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", locKey(loc))
  }

  function handleRowDragOver(e: DragEvent<HTMLElement>, loc: RowLoc) {
    if (result && dragFrom && !canDropOnSlot(result, dragFrom, loc, mixed)) {
      e.dataTransfer.dropEffect = "none"
      setDropTarget(null)
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropTarget(locKey(loc))
  }

  function handleRowDragLeave(e: DragEvent<HTMLElement>, loc: RowLoc) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDropTarget((current) => (current === locKey(loc) ? null : current))
  }

  function handleRowDrop(e: DragEvent<HTMLElement>, to: RowLoc) {
    e.preventDefault()
    if (dragFrom && result && canDropOnSlot(result, dragFrom, to, mixed)) {
      const previousPositions = captureRelayRowPositions()
      setResult((current) => (current ? moveRelayRow(current, dragFrom, to, mixed) : current))
      animateRelayRowSwap(previousPositions)
    }
    endDrag()
  }

  function dragStateClass(loc: RowLoc, enabled: boolean) {
    const key = locKey(loc)
    const isDragging = dragFrom != null && locKey(dragFrom) === key
    return (
      (enabled ? "cursor-grab active:cursor-grabbing " : "") +
      (isDragging ? "opacity-40 " : "") +
      (dropTarget === key && !isDragging ? "bg-primary/10 " : "")
    )
  }

  function saveDraft() {
    if (!result || result.teams.length === 0) return
    onCommit(
      { kind: "draft", teams: lineupTeamsOf(result), relayEvent: result.relay, optimal: isLoaded("optimal"), settings },
      guard.leave()
    )
  }

  function requestPublish() {
    if (hasImportedResults || !result) return
    if (result.teams.length === 0) return
    const incomplete = result.teams.find((t) => t.legs.length !== 4 || t.legs.some((l) => !l.athleteId))
    if (incomplete) {
      setError(`${incomplete.letter} relay is missing four athletes.`)
      return
    }
    const untimed = result.teams.find((t) => t.totalMs == null)
    if (untimed) {
      setError(`Enter a time for every leg of the ${untimed.letter} relay first.`)
      return
    }
    setError("")
    setConfirmPublish(true)
  }

  function publish() {
    if (hasImportedResults || !result) return
    setConfirmPublish(false)
    onCommit({ kind: "publish", teams: lineupTeamsOf(result), relayEvent: result.relay }, guard.leave())
  }

  const loadItems: { source: Source; label: string }[] = [
    { source: "optimal", label: "Optimal lineup" },
    ...(publishedTeams.length > 0 ? [{ source: "published" as const, label: "Published lineup" }] : []),
    ...(draftTeams ? [{ source: "draft" as const, label: "Saved draft" }] : []),
  ]
  const saveDraftLabel = data.published.some((relay) => relay.manual)
    ? "Save as draft and unpublish"
    : "Save as draft"
  // An option counts as loaded whenever the lineup on screen matches it — e.g. a saved draft that
  // is also the optimal lineup marks both.
  const currentKey = result && result.teams.length > 0 ? lineupKey(lineupTeamsOf(result)) : null
  const sourceTeams: Record<Source, LineupTeam[] | null> = {
    optimal: optimalTeams,
    published: publishedTeams.length > 0 ? publishedTeams : null,
    draft: draftTeams,
  }
  const isLoaded = (source: Source) => {
    const teams = sourceTeams[source]
    return currentKey != null && teams != null && lineupKey(teams) === currentKey
  }
  const poolIsCustom = settings.excludedIds.length > 0 || settings.addedIds.length > 0
  const editable = adding === 0
  const canAct = result != null && result.teams.length > 0 && !loading && editable

  const eventPicker = (
    <label className="relative -ml-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-fill focus-within:ring-[3px] focus-within:ring-primary/35">
      <select
        aria-label="Relay event"
        value={slot.slug}
        onChange={(e) => {
          // Unsaved changes: a full navigation, so the browser asks first.
          if (changed) guard.guardedNavigate(`${relaysPath}?event=${encodeURIComponent(e.target.value)}`)
          else onExit(e.target.value, guard.leave())
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {slots.map((s) => (
          <option key={s.slug} value={s.slug} className="bg-background text-foreground">
            {s.label}
          </option>
        ))}
      </select>
      <span className={relayEyebrowClass} aria-hidden>
        {slot.label}
      </span>
      <AppIcon name="chevronDown" strokeWidth={2.5} className="h-3.5 w-3.5 shrink-0 text-accent" />
    </label>
  )

  const actions = (
    <>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={loadOpen}
          onClick={() => setLoadOpen(!loadOpen)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 text-sm text-foreground transition-colors hover:bg-fill disabled:cursor-not-allowed disabled:opacity-40"
        >
          Load
          <AppIcon name="chevronDown" className="h-3 w-3" />
        </button>
        {loadOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setLoadOpen(false)} />
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+6px)] z-[41] flex min-w-[220px] flex-col rounded-[10px] border border-border bg-background p-1 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
            >
              {loadItems.map((item) => (
                <button
                  key={item.source}
                  type="button"
                  role="menuitem"
                  disabled={isLoaded(item.source)}
                  onClick={() => load(item.source)}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-fill disabled:cursor-default disabled:text-foreground-tertiary disabled:hover:bg-transparent"
                >
                  <span>{item.label}</span>
                  {isLoaded(item.source) ? (
                    <span className="text-xs text-foreground-secondary">Loaded</span>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={saveDraftLabel}
        onClick={saveDraft}
        disabled={!canAct || isLoaded("draft")}
        className={`${iconButtonClass} border border-fill text-foreground hover:bg-fill-secondary`}
      >
        <ActionIcon kind="check" className="h-4 w-4" />
        <HoverDetail label={saveDraftLabel} />
      </button>
      {!hasImportedResults ? (
        <button
          type="button"
          aria-label="Publish"
          onClick={requestPublish}
          disabled={!canAct || isLoaded("published")}
          className={`${iconButtonClass} bg-primary text-primary-contrast hover:bg-primary-hover disabled:hover:bg-primary`}
        >
          <ActionIcon kind="publish" className="h-4 w-4" />
          <HoverDetail label="Publish" />
        </button>
      ) : null}
    </>
  )

  const medley = isMedleyRelay(event)
  const alternates = result?.alternates ?? []
  // Every unused swimmer is kept as an alternate; each list shows a few until "Show more" reveals all.
  const shown = ALTERNATES_SHOWN[medley ? "medley" : "free"]
  const strokeLabels = new Map(medleyStrokeGroups(event).map((g) => [g.stroke, g.label]))
  const groups = alternateGroups(
    alternates,
    medley,
    mixed,
    (key) => (expandedAlternates[key] ? Infinity : shown)
  ).map((group) => ({
    ...group,
    label: strokeLabels.get(group.key) ?? group.key,
  }))

  return (
    <main className="w-full flex flex-col gap-6 py-2 sm:py-4">
      <RelayPageHeader
        meetName={meetName}
        iconUrl={iconUrl}
        back={
          <Link
            href={relaysPath}
            className={relayBackLinkClass}
            onClick={(e) => {
              // With unsaved changes the guard turns this into a full navigation that asks first.
              if (changed || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              onExit(null, guard.leave())
            }}
          >
            ← Relays
          </Link>
        }
        eyebrow={eventPicker}
        actions={actions}
      />

      <div className="flex min-w-0 flex-col gap-4">
        <section aria-label="Builder settings" className="flex flex-wrap items-end gap-x-3 gap-y-2 pb-1">
          <SettingsField label="Relays">
            <div
              role="group"
              aria-label="Relays"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-background px-[3px]"
            >
              {RELAY_LETTERS.map((letter, index) => {
                const on = index < teamCount + adding
                return (
                  <button
                    key={letter}
                    type="button"
                    aria-pressed={on}
                    disabled={loading || !editable}
                    onClick={() => pickRelayCount(index)}
                    className={
                      "h-7 w-7 rounded-md text-[13px] font-medium transition-colors disabled:cursor-not-allowed " +
                      (on
                        ? "bg-primary text-primary-contrast"
                        : "text-foreground-secondary hover:bg-fill hover:text-foreground")
                    }
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </SettingsField>

          <SettingsField
            label="Times from"
            help={<HelpButton label="What does Times from do?" onClick={() => setHelpOpen(true)} />}
          >
            <SelectControl
              label="Times from"
              value={String(settings.limitDays ?? "")}
              onChange={(value) => {
                const limitDays = value === "" ? null : Number(value)
                updateSettings({
                  limitDays,
                  // Prefer can't be wider than the limit.
                  withinDays:
                    windowDays(settings.withinDays) > windowDays(limitDays) ? limitDays : settings.withinDays,
                })
              }}
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.label} value={w.days ?? ""}>
                  {w.label}
                </option>
              ))}
            </SelectControl>
          </SettingsField>

          <SettingsField
            label="Prefer times from"
            help={<HelpButton label="What does Prefer times from do?" onClick={() => setHelpOpen(true)} />}
          >
            <SelectControl
              label="Prefer times from"
              value={String(settings.withinDays ?? "")}
              onChange={(value) => updateSettings({ withinDays: value === "" ? null : Number(value) })}
            >
              {TIME_WINDOWS.map((w) => (
                <option
                  key={w.label}
                  value={w.days ?? ""}
                  disabled={windowDays(w.days) > windowDays(settings.limitDays)}
                >
                  {w.label}
                </option>
              ))}
            </SelectControl>
          </SettingsField>

          {hasSignups ? (
            <SettingsField label="Athlete pool">
              <SelectControl
                label="Athlete pool"
                value={poolIsCustom ? "custom" : settings.signupPool}
                onChange={(value) => {
                  // "Custom" only reflects the refined list; picking a preset resets it.
                  if (value === "custom") return
                  updateSettings({ signupPool: value as SignupPool, excludedIds: [], addedIds: [] })
                }}
              >
                {poolIsCustom ? <option value="custom">Custom</option> : null}
                <option value="relay">Signed up for relay</option>
                <option value="meet">Signed up for meet</option>
                <option value="all">All athletes</option>
              </SelectControl>
            </SettingsField>
          ) : null}

          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Filter athletes, ${includedAthletes.length} included`}
            onClick={() => {
              setAthleteQuery("")
              setAthletePoolOpen(true)
            }}
            className={`${iconButtonClass} border border-border bg-background text-foreground hover:bg-fill-secondary`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="h-4 w-4">
              <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
            </svg>
            <span
              aria-hidden
              className="absolute -right-2 -top-[7px] inline-flex min-w-[18px] justify-center rounded-full bg-primary-bg px-[5px] text-[11px] font-semibold leading-[18px] text-accent"
            >
              {includedAthletes.length}
            </span>
            <HoverDetail label="Filter athletes" />
          </button>

          <span className="ml-auto self-end text-xs leading-9 text-foreground-secondary">
            Drag to swap. Click a name or time to change it.
          </span>
        </section>

        {error ? <p className="text-sm text-error">{error}</p> : null}

        {loading ? (
          <div role="status" aria-live="polite" aria-label="Building relay teams" className="flex flex-col gap-4">
            <span className="sr-only">Building relay teams</span>
            <div className={`grid items-start gap-3 ${RELAY_GRID_COLS[Math.min(Math.max(teamCount, 1), 4)]}`}>
              {Array.from({ length: Math.min(Math.max(teamCount, 1), 4) }, (_, t) => (
                <RelayCardSkeleton key={t} />
              ))}
            </div>
            <div>
              <Skeleton className="mb-2 h-3 w-20" />
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : result && result.teams.length > 0 ? (
          <>
            <div className={`grid items-start gap-3 ${RELAY_GRID_COLS[Math.min(result.teams.length + adding, 4)]}`}>
              {result.teams.map((team) => (
                <div key={team.letter} className="min-w-0 rounded-lg border border-border bg-background">
                  <div className="flex items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5 text-[15px] font-medium text-foreground">
                    <span>{team.letter} Relay</span>
                    <span className="font-mono tabular-nums">{formatLegTime(team.totalMs)}</span>
                  </div>
                  <div>
                    {team.legs.map((leg, i) => {
                      const loc: RowLoc = { list: "team", letter: team.letter, index: i }
                      const key = locKey(loc)
                      const editingField = editing?.key === key ? editing.field : null
                      const draggable = editable && editingField == null
                      return (
                        <div
                          key={leg.athleteId || key}
                          ref={(element) => {
                            if (element) relayRowRefs.current.set(leg.athleteId, element)
                            else relayRowRefs.current.delete(leg.athleteId)
                          }}
                          draggable={draggable}
                          onDragStart={(e) => handleRowDragStart(e, loc)}
                          onDragOver={(e) => handleRowDragOver(e, loc)}
                          onDragLeave={(e) => handleRowDragLeave(e, loc)}
                          onDrop={(e) => handleRowDrop(e, loc)}
                          onDragEnd={endDrag}
                          className={`flex items-center justify-between gap-2.5 border-t border-border px-3 py-1.5 first:border-t-0 last:rounded-b-lg ${dragStateClass(loc, draggable)}`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                                {editingField === "name" ? (
                                  <LegNameEditor
                                    initialName={leg.name}
                                    candidates={legCandidates(team.letter, i)}
                                    onPick={(athlete) => pickLegAthlete(team.letter, i, athlete)}
                                    onCancel={() => setEditing(null)}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditing({ key, field: "name" })}
                                    disabled={!editable}
                                    title="Change swimmer"
                                    className="-mx-1 min-w-0 cursor-text! truncate rounded px-1 text-left transition-colors hover:bg-background-hover disabled:cursor-default!"
                                  >
                                    {leg.name}
                                  </button>
                                )}
                                {mixed ? <GenderTag gender={leg.gender} /> : null}
                              </div>
                              <p className="text-xs text-foreground-secondary">{leg.event}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end text-right leading-tight">
                            {editingField === "time" ? (
                              <LegTimeEditor
                                timeMs={leg.timeMs}
                                onSave={(timeMs) => saveLegTime(team.letter, i, timeMs)}
                                onCancel={() => setEditing(null)}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditing({ key, field: "time" })}
                                disabled={!editable}
                                title="Enter a custom time"
                                className={
                                   "-mx-1 cursor-text! rounded px-1 font-mono text-[13px] tabular-nums transition-colors hover:bg-background-hover disabled:cursor-default! " +
                                  (leg.timeMs == null ? "text-error" : "text-foreground")
                                }
                              >
                                {formatLegTime(leg.timeMs)}
                              </button>
                            )}
                            <SourceDate leg={leg} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {Array.from({ length: adding }, (_, t) => (
                <RelayCardSkeleton key={`adding-${t}`} />
              ))}
            </div>

            {alternates.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                  Alternates
                </h4>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] items-start gap-3">
                  {groups.map((group) => (
                    // A card like the relays, but on the page background so alternates read as secondary.
                    <div key={group.key} className="min-w-0 rounded-lg border border-border">
                      {/* Medley alternates are split by stroke; a free relay's single list needs no header. */}
                      {medley ? (
                        <div className="flex items-baseline justify-between gap-2 border-b border-border px-3.5 py-2">
                          <span className="text-[13px] font-medium text-foreground">{group.label}</span>
                          <span className="text-xs text-foreground-secondary">{group.rows.length + group.hidden}</span>
                        </div>
                      ) : null}
                      <div>
                        {group.rows.map(({ alt, index }) => {
                          const loc: RowLoc = { list: "alt", index }
                          return (
                            <div
                              key={`${alt.athleteId}-${alt.event}-${index}`}
                              ref={(element) => {
                                if (element) relayRowRefs.current.set(alt.athleteId, element)
                                else relayRowRefs.current.delete(alt.athleteId)
                              }}
                              draggable={editable}
                              onDragStart={(e) => handleRowDragStart(e, loc)}
                              onDragOver={(e) => handleRowDragOver(e, loc)}
                              onDragLeave={(e) => handleRowDragLeave(e, loc)}
                              onDrop={(e) => handleRowDrop(e, loc)}
                              onDragEnd={endDrag}
                              className={`flex items-center justify-between gap-3 border-t border-border px-3 py-2 first:border-t-0 ${dragStateClass(loc, editable)}`}
                            >
                              <div className="min-w-0">
                                <p className="flex min-w-0 items-center gap-1.5 text-sm text-foreground-secondary">
                                  <span className="truncate">{alt.name}</span>
                                  {mixed ? <GenderTag gender={alt.gender} /> : null}
                                </p>
                                {!medley ? (
                                  <p className="text-xs leading-4 text-foreground-secondary">{alt.event}</p>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 flex-col items-end leading-tight">
                                <span className="font-mono text-sm tabular-nums text-foreground-secondary">
                                  {formatLegTime(alt.timeMs)}
                                </span>
                                <SourceDate leg={alt} />
                              </div>
                            </div>
                          )
                        })}
                        {group.rows.length === 0 ? (
                          <p className="px-3 py-2.5 text-xs text-foreground-secondary">No alternates</p>
                        ) : null}
                      </div>
                      {group.hidden > 0 || (expandedAlternates[group.key] && group.rows.length > shown) ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedAlternates((prev) => ({ ...prev, [group.key]: !prev[group.key] }))
                          }
                          className="w-full rounded-b-lg border-t border-border px-3 py-2 text-left text-xs font-medium text-foreground-secondary transition-colors hover:bg-background-hover hover:text-foreground"
                        >
                          {expandedAlternates[group.key] ? "Show less" : "Show more"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <Modal
        open={athletePoolOpen}
        onClose={() => {
          setAthletePoolOpen(false)
          setAthleteQuery("")
        }}
        title="Refine athletes"
        description="Choose the swimmers to consider when building this relay lineup."
        maxWidth="lg"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setAthletePoolOpen(false)
                setAthleteQuery("")
              }}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-fill-secondary"
            >
              Done
            </button>
          </ModalFooter>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-foreground-secondary">
            {includedAthletes.length} of {poolAthletes.length} included
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  excludedIds: [],
                  addedIds: poolAthletes.filter((a) => !poolIdSet.has(a.id)).map((a) => a.id),
                })
              }
              disabled={includedAthletes.length === poolAthletes.length}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-fill-secondary disabled:opacity-40"
            >
              Include all
            </button>
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  excludedIds: poolAthletes.filter((a) => poolIdSet.has(a.id)).map((a) => a.id),
                  addedIds: [],
                })
              }
              disabled={includedAthletes.length === 0}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-fill-secondary disabled:opacity-40"
            >
              Exclude all
            </button>
          </div>
        </div>

        <input
          type="search"
          value={athleteQuery}
          onChange={(e) => setAthleteQuery(e.target.value)}
          placeholder="Search athletes"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />

        {visibleAthletes.length === 0 ? (
          <p className="py-2 text-sm text-foreground-secondary">
            {poolAthletes.length === 0 ? `No ${genderPeople} in this pool.` : "No matching athletes."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {visibleAthletes.map((athlete) => {
              const included = includedIdSet.has(athlete.id)
              const name = athleteName(athlete)
              return (
                <li key={athlete.id}>
                  <label
                    className={
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors " +
                      (included
                        ? "border-primary/50 bg-primary/10"
                        : "border-border-secondary bg-background hover:bg-fill-secondary")
                    }
                  >
                    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={included}
                        onChange={() => toggleIncluded(athlete.id)}
                        className="peer sr-only"
                      />
                      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-border-secondary bg-background transition-colors peer-checked:border-[var(--brand-color-primary)] peer-checked:bg-[var(--brand-color-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 text-[var(--brand-primary-palette-1)]">
                          <path d="m3.25 8.25 3 3 6.5-6.5" />
                        </svg>
                      </span>
                    </span>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-accent">
                      {name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      <p className="text-xs text-foreground-secondary">
                        {included ? "Included" : "Excluded"}
                        {mixed && athlete.gender ? ` · ${athlete.gender}` : ""}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </Modal>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-fill"
            >
              Done
            </button>
          </ModalFooter>
        }
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Times from</p>
          <p className="text-sm text-foreground-secondary">
            Only swims inside this time window are used. Older swims are ignored, even if they are faster.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Prefer times from</p>
          <p className="text-sm text-foreground-secondary">
            Swims inside this time window are used first. If a swimmer has no time in it, an older swim is used
            and its date is shown in red.
          </p>
        </div>
      </Modal>

      <Modal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title={`Publish ${slot.label}?`}
        description="Athletes will see it on the Relays page."
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmPublish(false)}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={publish}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              Publish
            </button>
          </ModalFooter>
        }
      />
    </main>
  )
}
