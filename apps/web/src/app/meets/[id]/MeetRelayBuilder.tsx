"use client"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
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
  timeWindowTag,
  alternateGroups,
  alternateStroke,
  appendTeams,
  applyLegOrder,
  defaultBuildSettings,
  provisionalLineupResult,
  applyLineupTeams,
  canDropOnSlot,
  compareWithPublished,
  draftTeamsFor,
  fetchOptimalRelay,
  formatTimeDiff,
  initialFinalsLineup,
  formatLegTime,
  initialLineup,
  isMedleyRelay,
  legStroke,
  lineupKey,
  lineupTeamsOf,
  locKey,
  pendingDraft,
  medleyStrokeGroups,
  moveRelayRow,
  refinedPoolFor,
  publishedLineup,
  replaceLeg,
  setLegTime,
  settingsKey,
  slotTime,
  type BuildSettings,
  type LegOrder,
  withPoolAthletes,
  truncateTeams,
  windowDays,
  type AthleteOption,
  type BuilderRound,
  type Leg,
  type LineupTeam,
  type RelayEventSlot,
  type RelayResult,
  type RelaySlotData,
  type RelaySlotVersion,
  type RowLoc,
  type SignupPool,
} from "@/lib/meet/relay-builder"
import { LedgerIcon } from "@/components/meet/Ledger"
import RelayCompareView, { type CompareSide } from "./relays/RelayCompareView"
import RelayPageHeader, { relayBackLinkClass, relayEyebrowClass } from "./relays/RelayPageHeader"
import { NO_ROUNDS, independentFinals, type RelayCommit, type RelayRoundsInfo } from "@/lib/meet/relay-save"
import { RELAY_EDIT_IDLE_TIMEOUT_MS, RELAY_EDIT_IDLE_WARNING_MS } from "@/lib/meet/relay-edit-lock-shared"
import { savedAtLabel, savedByLine, unpublishedLineupPhrase } from "./relays/relay-workspace"

type Source = "optimal" | "published" | "draft"

type BuildRequest = {
  id: number
  settings: BuildSettings
  /** Lineup to keep and re-time; null builds the optimal lineup. */
  fixed: LineupTeam[] | null
  count: number
  /** What this build loads (marks the lineup unchanged); null keeps the current source. */
  source: Source | null
  /** A settings change re-timing the lineup on screen: what it was loaded with stays the baseline. */
  retime?: boolean
  /** The earlier save this build loads, so the load menu can check it while it builds. */
  versionId?: string
}

/** The lineup the builder's edits are compared against, for the cards' time differences. */
const BASELINE_TEXT: Record<Source, { relay: string }> = {
  published: { relay: "published relay" },
  draft: { relay: "saved draft" },
  optimal: { relay: "optimal relay" },
}

/**
 * The lineup last loaded (draft, published or optimal) and the settings it was loaded with —
 * `finalsKey` is finals' own lineup as loaded (null = finals followed prelims).
 */
type LoadedLineup = { source: Source; key: string; finalsKey: string | null; settings: string }

/** A lineup with a finals lineup of its own (null = finals follows prelims). */
type RoundLineups = { prelims: LineupTeam[]; finals: LineupTeam[] | null }

const ROUND_NAME: Record<BuilderRound, string> = { P: "Prelims", F: "Finals" }

/** A relay or alternate row, in the round whose lineup it belongs to. */
type RoundLoc = { round: BuilderRound; loc: RowLoc }

function roundLocKey({ round, loc }: RoundLoc): string {
  return `${round}:${locKey(loc)}`
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

const RANK_NAMES = ["Fastest", "2nd Fastest", "3rd Fastest", "4th Fastest"]
const RANK_SHORT = ["1st", "2nd", "3rd", "4th"]
const LEG_NAMES = ["Leg 1", "Leg 2", "Leg 3", "Leg 4"]
/** Fastest leads off through slowest anchors — where a custom order starts. */
const DEFAULT_CUSTOM_ORDER: LegOrder = [0, 1, 2, 3]

const menuPanelClass =
  "rounded-xl border border-border bg-background p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"

/**
 * Leg order's dropdown: Auto, or Custom — hovering (or tapping) Custom opens the custom order in a
 * flyout beside the menu, where legs 1–4 with the swimmer (by speed) on each are dragged into
 * order. Changing the order picks Custom. On a narrow screen there's
 * no room beside the menu, so the order opens under the row instead.
 */
function LegOrderDropdown({
  order,
  open,
  onOpenChange,
  orderDisabled,
  mixed,
  onChange,
}: {
  /** The custom order; null = Auto. */
  order: LegOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The order can't be changed (it can still be looked at). */
  orderDisabled: boolean
  /** A mixed relay, which Auto swims men, men, women, women. */
  mixed: boolean
  onChange: (order: LegOrder | null) => void
}) {
  const autoHelp = [
    "Leadoff has least difference between flat & relay start time",
    ...(mixed ? ["Mixed relays ensure Man, Man, Woman, Woman"] : []),
  ]
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [flyoutLeft, setFlyoutLeft] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** A row is being dragged (a ref: the drag's pointer events come before a re-render). */
  const dragging = useRef(false)
  const customRowRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  function close() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setFlyoutOpen(false)
    onOpenChange(false)
  }
  useEscapeToClose(open, close)

  // Beside the menu on the right, or on the left when there isn't room.
  useLayoutEffect(() => {
    if (!flyoutOpen) return
    const row = customRowRef.current
    if (!row) return
    const width = flyoutRef.current?.offsetWidth ?? 224
    setFlyoutLeft(row.getBoundingClientRect().right + 12 + width > window.innerWidth - 8)
  }, [flyoutOpen])

  function showFlyout() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setFlyoutOpen(true)
  }
  function scheduleFlyoutClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    // A drag cancels the pointer, which reads as leaving — keep the order open while dragging.
    if (dragging.current) return
    closeTimer.current = setTimeout(() => setFlyoutOpen(false), 150)
  }

  const shown = order ?? DEFAULT_CUSTOM_ORDER
  /** The speed rank swimming each leg (`order` is the leg for each rank). */
  const ranks = [0, 1, 2, 3].map((leg) => shown.indexOf(leg))
  const ranksLabel = ranks.map((r) => RANK_SHORT[r]).join(" · ")

  function move(from: number, to: number) {
    if (orderDisabled || from === to || to < 0 || to > 3) return
    const next = [...ranks]
    const [rank] = next.splice(from, 1)
    next.splice(to, 0, rank)
    const nextOrder: LegOrder = [0, 0, 0, 0]
    next.forEach((r, leg) => {
      nextOrder[r] = leg
    })
    onChange(nextOrder)
  }

  function endDrag() {
    dragging.current = false
    setDragFrom(null)
    setDragOver(null)
  }

  const rowClass = (selected: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-fill ${
      selected ? "text-accent" : "text-foreground"
    }`
  return (
    <span className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={order ? `Leg order: Custom, ${ranks.map((r) => RANK_SHORT[r]).join(", ")}` : "Leg order: Auto"}
        onClick={() => (open ? close() : onOpenChange(true))}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:border-border-secondary"
      >
        <span>{order ? "Custom" : "Auto"}</span>
        {order ? <span className="text-foreground-secondary">{ranksLabel}</span> : null}
        <AppIcon name="chevronDown" className="h-3.5 w-3.5 shrink-0 text-foreground-secondary" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            role="menu"
            aria-label="Leg order"
            className={`absolute left-0 top-[calc(100%+6px)] z-[41] flex min-w-[180px] flex-col gap-0.5 ${menuPanelClass}`}
          >
            {/* The whole row picks Auto; the "?" sits over it (a button can't hold another). */}
            <div
              className={`relative ${rowClass(order == null)}`}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") scheduleFlyoutClose()
              }}
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={order == null}
                aria-label="Auto"
                onClick={() => {
                  onChange(null)
                  close()
                }}
                className="absolute inset-0 rounded-lg"
              />
              <span>Auto</span>
              <button
                type="button"
                aria-label={`What does Auto do? ${autoHelp.join(" ")}`}
                className="relative inline-grid h-4 w-4 place-items-center rounded-full border border-border text-[10px] font-semibold leading-none text-foreground-secondary transition-colors hover:bg-fill hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35"
              >
                ?
                <HoverDetail label={autoHelp} />
              </button>
              <span className="flex-1" />
              {order == null ? <LedgerIcon name="check" className="h-4 w-4 shrink-0" /> : null}
            </div>
            <div
              ref={customRowRef}
              className="relative"
              // Mouse only: a touch "hover" would open it just before the tap's click toggled it shut.
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") showFlyout()
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") scheduleFlyoutClose()
              }}
              onDragEnter={showFlyout}
            >
              <button
                type="button"
                role="menuitemradio"
                aria-checked={order != null}
                aria-haspopup="dialog"
                aria-expanded={flyoutOpen}
                onClick={() => {
                  if (!order) {
                    onChange(DEFAULT_CUSTOM_ORDER)
                    showFlyout()
                  } else if (flyoutOpen) setFlyoutOpen(false)
                  else showFlyout()
                }}
                className={`${rowClass(order != null)} ${flyoutOpen ? "bg-fill" : ""}`}
              >
                <span className="flex-1">Custom</span>
                {order ? <LedgerIcon name="check" className="h-4 w-4 shrink-0" /> : null}
                <LedgerIcon name="chevronRight" className="h-4 w-4 shrink-0 text-foreground-tertiary max-[560px]:rotate-90" />
              </button>
              {flyoutOpen ? (
                <div
                  ref={flyoutRef}
                  role="dialog"
                  aria-label="Custom leg order"
                  className={`absolute top-[-6px] z-[42] w-56 ${
                    flyoutLeft ? "right-[calc(100%+12px)]" : "left-[calc(100%+12px)]"
                  } ${menuPanelClass} max-[560px]:static max-[560px]:mt-0.5 max-[560px]:w-auto max-[560px]:rounded-lg max-[560px]:border-0 max-[560px]:bg-fill-secondary max-[560px]:p-1 max-[560px]:shadow-none`}
                >
                  <ol>
                    {ranks.map((rank, leg) => (
                      <li
                        key={rank}
                        draggable={!orderDisabled}
                        onDragStart={(e) => {
                          dragging.current = true
                          setDragFrom(leg)
                          e.dataTransfer.effectAllowed = "move"
                          e.dataTransfer.setData("text/plain", String(leg))
                        }}
                        onDragOver={(e) => {
                          if (dragFrom == null) return
                          e.preventDefault()
                          e.dataTransfer.dropEffect = "move"
                          setDragOver(leg)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (dragFrom != null) move(dragFrom, leg)
                          endDrag()
                        }}
                        onDragEnd={endDrag}
                        className={
                          "flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2.5 text-sm transition-colors " +
                          (orderDisabled ? "" : "cursor-grab active:cursor-grabbing ") +
                          (dragFrom === leg ? "opacity-40 " : "") +
                          (dragOver === leg && dragFrom !== leg ? "bg-primary/10" : "hover:bg-background-hover")
                        }
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="h-4 w-4 shrink-0 text-foreground-tertiary">
                          {[4, 8, 12].flatMap((y) => [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" />))}
                        </svg>
                        <span className="w-14 shrink-0 text-foreground">{LEG_NAMES[leg]}</span>
                        <span className="min-w-0 flex-1 truncate text-foreground-secondary">{RANK_NAMES[rank]}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </span>
  )
}

/**
 * A row of the builder's status menu: load the lineup, plus an icon-only delete when it can be
 * deleted (two buttons side by side — a button can't hold another).
 */
/** Two columns side by side, for "Compare". */
function CompareIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </svg>
  )
}

const menuRowActionClass =
  "relative grid h-8 w-8 place-items-center rounded-md text-foreground-secondary transition-colors disabled:cursor-not-allowed disabled:opacity-50"

function MenuRow({
  label,
  detail,
  loaded,
  onLoad,
  onCompare,
  deleteLabel,
  deleteDisabled,
  onDelete,
}: {
  label: string
  detail?: string | null
  loaded: boolean
  onLoad: () => void
  /** Compare this lineup with the one on screen; absent when it is the one on screen. */
  onCompare?: () => void
  deleteLabel: string | null
  deleteDisabled?: boolean
  onDelete: () => void
}) {
  // Styled like the meet page's menus (MeetMenu's MenuItem): the loaded row reads in gold with a
  // check. On hover or focus (always on touch screens, which can't hover) the row's actions —
  // compare, delete — take the check's place at the right, so every check sits in the same spot.
  const actions = (onCompare ? 1 : 0) + (deleteLabel ? 1 : 0)
  const revealClass =
    "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
  return (
    <div className="group relative flex items-center rounded-lg transition-colors hover:bg-fill">
      <button
        type="button"
        role="menuitemradio"
        aria-checked={loaded}
        disabled={loaded}
        onClick={onLoad}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg py-[9px] pl-2.5 text-left text-sm disabled:cursor-default ${
          actions > 1 ? "pr-[88px]" : "pr-14"
        } ${loaded ? "text-accent" : "text-foreground"}`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{label}</span>
          {detail ? (
            <span className={`truncate text-xs ${loaded ? "text-accent" : "text-foreground-secondary"}`}>{detail}</span>
          ) : null}
        </span>
      </button>
      <span className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {loaded ? (
          <span
            className={`absolute right-0 grid h-8 w-8 place-items-center text-accent ${
              actions > 0 ? "group-hover:invisible group-focus-within:invisible pointer-coarse:invisible" : ""
            }`}
          >
            <LedgerIcon name="check" />
          </span>
        ) : null}
        {onCompare ? (
          <button
            type="button"
            role="menuitem"
            aria-label={`Compare ${label} with the lineup on screen`}
            onClick={onCompare}
            className={`pointer-events-auto ${menuRowActionClass} hover:bg-fill-secondary hover:text-foreground ${revealClass}`}
          >
            <CompareIcon />
            <HoverDetail label="Compare" />
          </button>
        ) : null}
        {deleteLabel ? (
          <button
            type="button"
            role="menuitem"
            aria-label={deleteLabel}
            disabled={deleteDisabled}
            onClick={onDelete}
            className={`pointer-events-auto ${menuRowActionClass} hover:bg-error-bg hover:text-error disabled:hover:bg-transparent disabled:hover:text-foreground-secondary ${revealClass}`}
          >
            <ActionIcon kind="delete" className="h-4 w-4" />
            <HoverDetail label={deleteLabel} />
          </button>
        ) : null}
        {/* Holds the check's spot when the row has no actions. */}
        {actions === 0 && loaded ? <span aria-hidden className="h-8 w-8" /> : null}
      </span>
    </div>
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

/** "0:42" until `deadline`, ticking each second. */
function IdleCountdown({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(deadline - RELAY_EDIT_IDLE_WARNING_MS)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
  return <span className="font-mono tabular-nums">{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}</span>
}

const RELAY_GRID_COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
}

/** Grid columns for `count` relay cards, up to four across. */
function relayGridCols(count: number): string {
  return RELAY_GRID_COLS[Math.min(Math.max(count, 1), 4)]
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
  rounds = NO_ROUNDS,
  siblingFinals = null,
  initialBase = null,
  initialBaseSettings = null,
  onCommit,
  onExit,
  takeoverRequested = false,
  locked = true,
  onSessionEnd,
  onDirtyChange,
  newerSaved = false,
  onLoadNewer,
  onDeleteDraft,
  onDeleteVersion,
  restore = null,
  banner = null,
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
   * Prelims / finals: for a relay that swims prelims and finals ("Prelims & finals" on) the builder
   * edits a lineup per round — finals follows prelims until a coach changes it — and publishes
   * rounds not swum yet.
   */
  rounds?: RelayRoundsInfo
  /**
   * The other gender's relay of the event ("Men's 200 Free Relay") when it has its own finals
   * lineup: turning "Prelims & finals" off (shared by both) drops that too. Null when none.
   */
  siblingFinals?: string | null
  /**
   * Optimal result the summary already built at the default settings. Shown as-is for an event
   * with nothing saved, or used to time the draft / published lineup — so no first fetch.
   */
  initialBase?: RelayResult | null
  /** settingsKey of the settings `initialBase` was built at; null = the default settings. */
  initialBaseSettings?: string | null
  /** Save as draft / publish: the workspace shows the summary at once and saves in the background. */
  onCommit: (commit: RelayCommit, replaceHistory: boolean) => void
  /** Leave for the summary (`slug` null) or another event, without a server round trip. */
  onExit: (slug: string | null, replaceHistory: boolean) => void
  /** Another coach asked to take over this event: save any changes as a draft and leave. */
  takeoverRequested?: boolean
  /** This tab holds the event's edit lock; saving and publishing wait for it. */
  locked?: boolean
  /**
   * The edit session is over (taken over, or idle too long): `draft` holds unsaved changes to
   * save as a draft, or is null when there are none.
   */
  onSessionEnd: (reason: "takeover" | "idle", draft: RelayCommit | null, replaceHistory: boolean) => void
  /** Told whenever the builder gains or loses unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void
  /** The event was saved elsewhere since the builder opened, while it has unsaved changes. */
  newerSaved?: boolean
  /** Drop this builder's changes and show what was saved elsewhere. */
  onLoadNewer?: () => void
  /**
   * Delete the event's saved draft and its settings — with `unpublish`, the lineup the builder
   * published too; the builder then reopens on the optimal lineup. Resolves to an error message,
   * if any.
   */
  onDeleteDraft?: (unpublish: boolean) => Promise<string | null>
  /** Delete one earlier version from the event's history; resolves to an error message, if any. */
  onDeleteVersion?: (versionId: string) => Promise<string | null>
  /** A lineup whose save failed: the builder opens on it, unsaved, to try again. */
  restore?: RelayCommit | null
  /** Save errors and session notices from the relays page, shown under the header. */
  banner?: ReactNode
}) {
  const { slot } = data
  const { gender, event } = slot
  const mixed = gender === "X"
  const hasSignups = signupRelayPrefs != null && Object.keys(signupRelayPrefs).length > 0
  /** "Prelims & finals" as saved; results lock it. */
  const savedSplit = rounds.prelimsFinals
  /**
   * The event swims prelims and finals, so the builder edits a lineup per round. Shared by
   * Women's and Men's; a lineup whose save failed reopens with the choice it was saved with.
   */
  const [splitRounds, setSplitRounds] = useState(() =>
    rounds.locked ? savedSplit : (restore?.prelimsFinals ?? savedSplit)
  )
  /** Asking before turning "Prelims & finals" off drops a finals lineup of its own. */
  const [confirmTimedFinal, setConfirmTimedFinal] = useState(false)
  const genderOf = useMemo(() => new Map(athletes.map((a) => [a.id, a.gender])), [athletes])
  /**
   * What the builder opens on: a lineup whose save failed (to try again), else the event's draft,
   * else what's published, else optimal.
   */
  const [start] = useState(() => {
    if (restore) {
      return {
        source: "draft" as Source,
        prelims: restore.teams as LineupTeam[] | null,
        finals: splitRounds ? independentFinals(restore.teams, restore.finalsTeams) : null,
        settings: restore.settings ?? null,
      }
    }
    const { source, fixed } = initialLineup(data, splitRounds ? "P" : undefined)
    return { source, prelims: fixed, finals: splitRounds ? initialFinalsLineup(data) : null, settings: null }
  })
  /** Opened on a lineup whose save failed: it has nothing saved behind it until it's saved again. */
  const restored = restore != null
  /** Finals' own lineup when the builder opens; null = finals follows prelims. */
  const initialFinals = start.finals
  /**
   * Finals' own lineup, shown in the finals cards beside prelims; null while finals follows
   * prelims (its cards mirror the prelims ones until one is edited).
   */
  const [finalsTeams, setFinalsTeams] = useState<LineupTeam[] | null>(initialFinals)
  /** Read by builds, which also time finals' swimmers. */
  const finalsTeamsRef = useRef(finalsTeams)
  useEffect(() => {
    finalsTeamsRef.current = finalsTeams
  })
  const prelimsArg = splitRounds ? ("P" as const) : undefined
  const publishedTeams = useMemo(() => publishedLineup(data, prelimsArg), [data, prelimsArg])
  /** Finals' own published lineup; null when it's the prelims one (or there are no rounds). */
  const publishedFinals = useMemo(
    () => (splitRounds ? independentFinals(publishedTeams, publishedLineup(data, "F")) : null),
    [data, splitRounds, publishedTeams]
  )
  /** What saving a draft takes down: a coach-published lineup athletes can see now; null when none. */
  const takenDownByDraft = unpublishedLineupPhrase(data.published, savedSplit)
  /** Something is published for the event — from the builder or imported from a sheet. */
  const hasPublishedLineup = publishedTeams.length > 0
  /** Publishing adds seeds: blocked once results are in — at a finals meet, once both rounds are swum. */
  const canPublish = rounds.finalsSession ? !(rounds.swum.P && rounds.swum.F) : !hasImportedResults
  const draftTeams = draftTeamsFor(pendingDraft(data), prelimsArg)
  /** The saved draft's own finals lineup; null when it follows prelims. */
  const draftFinals =
    splitRounds && draftTeams ? independentFinals(draftTeams, pendingDraft(data)?.finalsTeams) : null

  const defaultSettings = defaultBuildSettings(hasSignups)
  // Settings are saved with the draft, and publishing saves the published lineup's as one. A draft
  // from before settings were saved opens on the defaults.
  const savedSettings = data.draft?.settings ?? defaultSettings
  const settingsSource: Source = data.draft?.published ? "published" : "draft"
  const [request, setRequest] = useState<BuildRequest>(() => {
    // Open on the draft, else what's published, else optimal — with the saved settings.
    const { source, prelims: fixed } = start
    const settings = start.settings ?? savedSettings
    return { id: 0, settings, fixed, count: fixed ? fixed.length : DEFAULT_RELAY_COUNT, source }
  })
  const settings = request.settings
  /** The summary's build was made at the settings the builder opens with, so it can be reused. */
  const [baseFits] = useState(
    () => initialBase != null && settingsKey(request.settings) === (initialBaseSettings ?? settingsKey(defaultSettings))
  )
  // The summary already ran this event's first build at these settings — reuse it.
  const [initial] = useState(() => {
    if (!initialBase || !baseFits) return null
    const pool = poolPeople(refinedPoolFor(athletes, gender, event, request.settings, signupRelayPrefs).included)
    if (request.fixed) {
      return withPoolAthletes(
        applyLineupTeams(initialBase, request.fixed, new Map(athletes.map((a) => [a.id, a.gender]))),
        pool
      )
    }
    return initialBase.teams.length > 0 ? withPoolAthletes(applyLegOrder(initialBase, request.settings.legOrder), pool) : null
  })
  const [loading, setLoading] = useState(initial == null)
  /** New relays (C, D, …) being built from swimmers not already on a relay. */
  const [adding, setAdding] = useState(0)
  const addAbortRef = useRef<AbortController | null>(null)
  // No build to reuse yet: a saved lineup shows at once with its saved times, dimmed while its
  // build runs.
  const [result, setResult] = useState<RelayResult | null>(() =>
    initial ??
    (request.fixed
      ? provisionalLineupResult(event, course, request.fixed, new Map(athletes.map((a) => [a.id, a.gender])))
      : null)
  )
  const [loaded, setLoaded] = useState<LoadedLineup | null>(() =>
    initial && request.source
      ? {
          source: request.source,
          key: lineupKey(lineupTeamsOf(initial)),
          finalsKey: initialFinals ? lineupKey(initialFinals) : null,
          settings: settingsKey(request.settings),
        }
      : null
  )
  /** The optimal lineup at the current settings and relay count, to compare against; null = unknown. */
  const [optimalTeams, setOptimalTeams] = useState<LineupTeam[] | null>(() =>
    initialBase && baseFits && initialBase.teams.length > 0
      ? lineupTeamsOf(applyLegOrder(initialBase, request.settings.legOrder))
      : null
  )
  const [error, setError] = useState("")
  /** Alternate lists expanded by "Show more", per stroke (medley) or "free". */
  const [expandedAlternates, setExpandedAlternates] = useState<Record<string, boolean>>({})
  /** Publishing asks first, unless it's re-publishing the published lineup unchanged. */
  const [confirmPublish, setConfirmPublish] = useState(false)
  /** Saving a draft that takes a published lineup down asks first. */
  const [confirmDraft, setConfirmDraft] = useState(false)
  /** Deleting the saved draft asks first; `deleting` while the delete lands. */
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState(false)
  const [deletingDraft, setDeletingDraft] = useState(false)
  const [deleteDraftError, setDeleteDraftError] = useState("")
  /** The earlier version whose deletion is being confirmed. */
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState<RelaySlotVersion | null>(null)
  const [deletingVersion, setDeletingVersion] = useState(false)
  const [deleteVersionError, setDeleteVersionError] = useState("")
  /** Comparing the lineup on screen with one from the status menu: that lineup and how to load it. */
  const [compare, setCompare] = useState<{ side: CompareSide; load: () => void } | null>(null)
  /** Phones show the build settings on demand. */
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [legOrderOpen, setLegOrderOpen] = useState(false)
  const [athleteQuery, setAthleteQuery] = useState("")
  const [athletePoolOpen, setAthletePoolOpen] = useState(false)
  const [dragFrom, setDragFrom] = useState<RoundLoc | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** Relay leg whose name or time is being edited inline. */
  const [editing, setEditing] = useState<{ key: string; field: "name" | "time" } | null>(null)
  const relayRowRefs = useRef(new Map<string, HTMLDivElement>())
  const settingsId = useId()

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
    const { settings: s, fixed, count, source, retime } = request
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
        ? [
            ...new Set([
              ...poolIds,
              ...[...(fixed ?? []), ...(finalsTeamsRef.current ?? [])].flatMap((t) => t.legs.map((l) => l.athleteId)),
            ]),
          ]
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
          next = applyLegOrder(res.result, s.legOrder)
        } else {
          setError(res.error)
        }
        setResult(next ? withPoolAthletes(next, poolPeople(includedPool)) : next)
        // Every build returns the optimal lineup too, even when re-timing a kept one.
        setOptimalTeams(
          res.ok && res.result.teams.length > 0 ? lineupTeamsOf(applyLegOrder(res.result, s.legOrder)) : null
        )
        if (next && source) {
          const key = lineupKey(lineupTeamsOf(next))
          const finals = finalsTeamsRef.current
          setLoaded((prev) => ({
            source,
            key,
            finalsKey: retime && prev?.source === source ? prev.finalsKey : finals ? lineupKey(finals) : null,
            settings: retime && prev?.source === source ? prev.settings : settingsKey(s),
          }))
        }
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

  /** The lineup differs from the one last loaded. */
  const changed =
    result != null && loaded != null && lineupKey(lineupTeamsOf(result)) !== loaded.key
  const settingsChanged = settingsKey(settings) !== settingsKey(savedSettings)
  /** "Prelims & finals" was turned on or off. */
  const splitChanged = splitRounds !== savedSplit
  /** Finals' lineup changed since it was loaded, or finals started or stopped following prelims. */
  const finalsChanged =
    splitRounds &&
    (finalsTeams ? lineupKey(finalsTeams) : null) !==
      (loaded ? loaded.finalsKey : initialFinals ? lineupKey(initialFinals) : null)
  /** Finals changed, or "Prelims & finals" was turned on or off. */
  const otherRoundChanged = finalsChanged || splitChanged
  const dirty = restored || changed || settingsChanged || otherRoundChanged
  const teamCount = result?.teams.length ?? request.count
  const guard = useUnsavedChangesGuard(dirty)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  /**
   * Rebuild with new settings, keeping the coach's lineup unless it's an untouched optimal one. The
   * published lineup or saved draft stays even when it's also the optimal lineup.
   */
  function updateSettings(patch: Partial<BuildSettings>) {
    const nextSettings = { ...settings, ...patch }
    const current = result && result.teams.length > 0 ? lineupKey(lineupTeamsOf(result)) : null
    const savedSource: Source | null =
      current == null
        ? null
        : publishedTeams.length > 0 && lineupKey(publishedTeams) === current
          ? "published"
          : draftTeams && lineupKey(draftTeams) === current
            ? "draft"
            : null
    const keep = current != null && (loaded?.source !== "optimal" || changed || savedSource != null)
    setRequest((r) => ({
      id: r.id + 1,
      settings: nextSettings,
      fixed: keep && result ? lineupTeamsOf(result) : null,
      count: r.count,
      source: keep ? savedSource : "optimal",
      retime: keep,
    }))
  }

  /**
   * Finals' lineup as shown: its own, timed by the current build, else null while finals follows
   * prelims (its cards show the prelims result).
   */
  const finalsResult = useMemo(() => {
    if (!splitRounds || !result || !finalsTeams) return null
    // A saved lineup shown before its build: its saved times, like the prelims cards.
    if (Object.keys(result.strokeTimes ?? {}).length === 0) {
      return provisionalLineupResult(event, course, finalsTeams, genderOf)
    }
    return withPoolAthletes(applyLineupTeams(result, finalsTeams, genderOf), poolPeople(includedAthletes))
  }, [splitRounds, result, finalsTeams, event, course, genderOf, includedAthletes])

  /** A round's lineup as shown — finals that follows prelims shows the prelims one. */
  function roundResult(r: BuilderRound): RelayResult | null {
    return r === "F" && splitRounds ? (finalsResult ?? result) : result
  }

  /**
   * Change one round's lineup. Changing finals while it follows prelims makes it a lineup of its
   * own; custom times it sets are shared with prelims, like the rest of the swimmers' times.
   */
  function updateRound(r: BuilderRound, change: (current: RelayResult) => RelayResult) {
    if (r === "P" || !splitRounds) {
      setResult((current) => (current ? change(current) : current))
      return
    }
    const current = finalsResult ?? result
    if (!current) return
    const next = change(current)
    if (next === current) return
    setFinalsTeams(lineupTeamsOf(next))
    if (next.strokeTimes !== current.strokeTimes) {
      setResult((prelims) => (prelims ? { ...prelims, strokeTimes: next.strokeTimes } : prelims))
    }
  }

  /** Results are in for this round, so its cards are locked (publishing leaves it as it is). */
  const roundSwum = (r: BuilderRound) => splitRounds && rounds.swum[r]

  /** Finals goes back to following prelims. */
  function followPrelims() {
    setEditing(null)
    setFinalsTeams(null)
  }

  /**
   * Turn "Prelims & finals" on (finals follows prelims until changed) or off — asking first when
   * that drops a finals lineup of its own, here or on the other gender's relay.
   */
  function requestPrelimsFinals(next: boolean) {
    setCompare(null)
    // Changeable while a lineup is still building (no result yet) — the build doesn't depend on it.
    if (next === splitRounds || rounds.locked || (!result && !loading)) return
    if (next) {
      setSplitRounds(true)
      setFinalsTeams(null)
      return
    }
    if (finalsTeams || siblingFinals) setConfirmTimedFinal(true)
    else makeTimedFinal()
  }

  /** "Prelims & finals" off: the prelims lineup becomes the event's one lineup. */
  function makeTimedFinal() {
    setConfirmTimedFinal(false)
    setEditing(null)
    setFinalsTeams(null)
    setSplitRounds(false)
  }

  /** Both rounds' lineups to save: `finalsTeams` null while finals follows prelims. */
  function roundLineups(current: RelayResult): { teams: LineupTeam[]; finalsTeams: LineupTeam[] | null } {
    const shown = lineupTeamsOf(current)
    if (!splitRounds || !finalsTeams) return { teams: shown, finalsTeams: null }
    // Re-timed, as a lineup loaded from what's published carries no times.
    const finals = finalsResult ?? applyLineupTeams(current, finalsTeams, genderOf)
    return { teams: shown, finalsTeams: lineupTeamsOf(finals) }
  }

  /** What a save commits besides the build: both rounds' lineups and a "Prelims & finals" change. */
  function commitLineups(current: RelayResult): Pick<RelayCommit, "teams" | "finalsTeams" | "prelimsFinals"> {
    return { ...roundLineups(current), ...(splitChanged ? { prelimsFinals: splitRounds } : {}) }
  }

  /** Load a lineup — both rounds: a saved lineup as saved, optimal with finals following prelims. */
  function load(source: Source) {
    setLoadOpen(false)
    setEditing(null)
    const fixed = source === "draft" ? draftTeams : source === "published" ? publishedTeams : null
    setFinalsTeams(source === "draft" ? draftFinals : source === "published" ? publishedFinals : null)
    setRequest((r) => ({
      id: r.id + 1,
      settings: source === settingsSource && data.draft?.settings ? data.draft.settings : r.settings,
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
      setFinalsTeams((teams) => teams?.slice(0, next) ?? null)
      // Relays are built fastest-first, so fewer optimal relays are the first ones.
      setOptimalTeams((teams) => teams?.slice(0, next) ?? null)
      return
    }
    addRelays(result, next - result.teams.length)
  }

  /**
   * Build `extra` more relays from swimmers not already on one, leaving the current relays alone —
   * for finals too when it has a lineup of its own (from swimmers not on a finals relay).
   */
  function addRelays(current: RelayResult, extra: number) {
    const finals = splitRounds && finalsTeams ? finalsResult : null
    const nextLetter = RELAY_LETTERS[current.teams.length]
    const unused = (lineup: RelayResult) => {
      const used = new Set(lineup.teams.flatMap((team) => team.legs.map((leg) => leg.athleteId)))
      return includedAthletes.map((a) => a.id).filter((id) => !used.has(id))
    }
    const builds = [{ round: "P" as BuilderRound, ids: unused(current) }]
    if (finals) builds.push({ round: "F", ids: unused(finals) })
    const short = builds.find((build) => build.ids.length < 4)
    if (short) {
      setError(
        `Not enough swimmers left in the pool for a ${nextLetter} ${builds.length > 1 ? `${ROUND_NAME[short.round].toLowerCase()} ` : ""}relay.`
      )
      return
    }
    addAbortRef.current?.abort()
    const controller = new AbortController()
    addAbortRef.current = controller
    setAdding(extra)
    setError("")
    Promise.all(
      builds.map((build) =>
        fetchOptimalRelay(
          {
            meetId,
            event,
            course,
            gender,
            relayCount: extra,
            withinDays: settings.withinDays,
            limitDays: settings.limitDays,
            athleteIds: build.ids,
          },
          controller.signal
        )
      )
    )
      .then(([prelimsRes, finalsRes]) => {
        if (controller.signal.aborted) return
        for (const res of [prelimsRes, finalsRes]) {
          if (res && (!res.ok || res.result.teams.length === 0)) {
            setError(res.ok ? `Not enough swimmers left for a ${nextLetter} relay.` : res.error)
            return
          }
        }
        if (!prelimsRes.ok) return
        setResult((cur) => (cur ? appendTeams(cur, applyLegOrder(prelimsRes.result, settings.legOrder)) : cur))
        if (finals && finalsRes?.ok) {
          setFinalsTeams(lineupTeamsOf(appendTeams(finals, applyLegOrder(finalsRes.result, settings.legOrder))))
        }
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

  /** Pool athletes who could take this leg, fastest first, with where they are now in its round. */
  function legCandidates(r: BuilderRound, letter: string, index: number): LegCandidate[] {
    const lineup = roundResult(r)
    if (!lineup) return []
    const outgoing = lineup.teams.find((team) => team.letter === letter)?.legs[index]
    if (!outgoing) return []
    const places = new Map<string, string>()
    for (const alt of lineup.alternates ?? []) places.set(alt.athleteId, "Alternate")
    for (const team of lineup.teams) {
      team.legs.forEach((leg, i) => {
        places.set(leg.athleteId, lineup.teams.length > 1 ? `${team.letter} · Leg ${i + 1}` : `Leg ${i + 1}`)
      })
    }
    const stroke = legStroke(lineup.relay, index)
    return includedAthletes
      // Mixed relays swap like-for-like so the lineup stays two men and two women.
      .filter((a) => a.id !== outgoing.athleteId && (!mixed || a.gender === outgoing.gender))
      .map((athlete) => ({
        athlete,
        timeMs: slotTime(lineup.strokeTimes?.[athlete.id], stroke, index)?.timeMs ?? null,
        place: places.get(athlete.id) ?? null,
      }))
      .sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || 0)
  }

  function pickLegAthlete(r: BuilderRound, letter: string, index: number, athlete: AthleteOption) {
    setEditing(null)
    const previousPositions = captureRelayRowPositions()
    updateRound(r, (current) =>
      replaceLeg(current, letter, index, {
        athleteId: athlete.id,
        name: athleteName(athlete),
        gender: athlete.gender,
      })
    )
    animateRelayRowSwap(previousPositions)
  }

  function saveLegTime(r: BuilderRound, letter: string, index: number, timeMs: number) {
    setEditing(null)
    updateRound(r, (current) => setLegTime(current, letter, index, timeMs))
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

  function handleRowDragStart(e: DragEvent<HTMLElement>, from: RoundLoc) {
    setDragFrom(from)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", roundLocKey(from))
  }

  /**
   * A row as a row of round `r`'s lineup: relay rows only in their own round; an alternate (the
   * one list, indexed like prelims' alternates) as the same swimmer and stroke in finals' list.
   */
  function locInRound(at: RoundLoc, r: BuilderRound): RowLoc | null {
    if (at.loc.list === "team") return at.round === r ? at.loc : null
    // Finals following prelims shares prelims' alternates.
    if (r === "P" || !finalsResult) return at.loc
    const alt = result?.alternates?.[at.loc.index]
    if (!alt) return null
    const index = (finalsResult.alternates ?? []).findIndex(
      (other) => other.athleteId === alt.athleteId && alternateStroke(other) === alternateStroke(alt)
    )
    return index >= 0 ? { list: "alt", index } : null
  }

  /**
   * What a drag from `from` to `to` changes, or null when it can't drop there: a swap inside one
   * round (both rows in that round's lineup), or a relay swimmer dropped on the other round's relay
   * when they aren't swimming that round — they replace the swimmer there (who becomes an
   * alternate) and stay on their own round's relay.
   */
  function resolveDrop(
    from: RoundLoc,
    to: RoundLoc
  ):
    | { kind: "swap"; round: BuilderRound; from: RowLoc; to: RowLoc }
    | { kind: "replace"; round: BuilderRound; letter: string; index: number; person: Leg }
    | null {
    const fromRow = from.loc
    const toRow = to.loc
    if (fromRow.list === "team" && toRow.list === "team" && from.round !== to.round) {
      if (roundSwum(to.round)) return null
      const person = roundResult(from.round)?.teams.find((t) => t.letter === fromRow.letter)?.legs[fromRow.index]
      const target = roundResult(to.round)
      const outgoing = target?.teams.find((t) => t.letter === toRow.letter)?.legs[toRow.index]
      if (!person || !target || !outgoing) return null
      // Already swimming the other round: that's a swap there, not a replacement.
      if (target.teams.some((t) => t.legs.some((leg) => leg.athleteId === person.athleteId))) return null
      // Mixed relays stay two men and two women.
      if (mixed && person.gender !== outgoing.gender) return null
      return { kind: "replace", round: to.round, letter: toRow.letter, index: toRow.index, person }
    }
    const team = from.loc.list === "team" ? from : to.loc.list === "team" ? to : null
    if (!team || roundSwum(team.round)) return null
    const r = team.round
    const fromLoc = locInRound(from, r)
    const toLoc = locInRound(to, r)
    const lineup = roundResult(r)
    if (!fromLoc || !toLoc || !lineup || !canDropOnSlot(lineup, fromLoc, toLoc, mixed)) return null
    return { kind: "swap", round: r, from: fromLoc, to: toLoc }
  }

  function handleRowDragOver(e: DragEvent<HTMLElement>, to: RoundLoc) {
    if (dragFrom && !resolveDrop(dragFrom, to)) {
      e.dataTransfer.dropEffect = "none"
      setDropTarget(null)
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDropTarget(roundLocKey(to))
  }

  function handleRowDragLeave(e: DragEvent<HTMLElement>, to: RoundLoc) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setDropTarget((current) => (current === roundLocKey(to) ? null : current))
  }

  function handleRowDrop(e: DragEvent<HTMLElement>, to: RoundLoc) {
    e.preventDefault()
    const drop = dragFrom ? resolveDrop(dragFrom, to) : null
    if (drop) {
      const previousPositions = captureRelayRowPositions()
      updateRound(drop.round, (current) =>
        drop.kind === "swap"
          ? moveRelayRow(current, drop.from, drop.to, mixed)
          : replaceLeg(current, drop.letter, drop.index, drop.person)
      )
      animateRelayRowSwap(previousPositions)
    }
    endDrag()
  }

  function dragStateClass(at: RoundLoc, enabled: boolean) {
    const key = roundLocKey(at)
    const isDragging = dragFrom != null && roundLocKey(dragFrom) === key
    return (
      (enabled ? "cursor-grab active:cursor-grabbing " : "") +
      (isDragging ? "opacity-40 " : "") +
      (dropTarget === key && !isDragging ? "bg-primary/10 " : "")
    )
  }

  /** Each lineup to load, with finals' own lineup (null = finals follows prelims). */
  const sourceLineups: Record<Source, RoundLineups | null> = {
    optimal: optimalTeams ? { prelims: optimalTeams, finals: null } : null,
    published: publishedTeams.length > 0 ? { prelims: publishedTeams, finals: publishedFinals } : null,
    draft: draftTeams ? { prelims: draftTeams, finals: draftFinals } : null,
  }

  /** The lineups on screen — both rounds — have the same swimmers (and custom times) as `lineup`. */
  function showsLineup(lineup: RoundLineups | null): boolean {
    if (!lineup || !result || result.teams.length === 0) return false
    const prelims = lineupTeamsOf(result)
    if (lineupKey(prelims) !== lineupKey(lineup.prelims)) return false
    return !splitRounds || lineupKey(finalsTeams ?? prelims) === lineupKey(lineup.finals ?? lineup.prelims)
  }

  /**
   * The lineup on screen is the published one, swimmers unchanged (times may be re-timed): opened as
   * published and not edited since, or the same swimmers as what's published.
   */
  const showsPublishedLineup =
    hasPublishedLineup &&
    result != null &&
    ((loaded?.source === "published" && !changed && !finalsChanged) || showsLineup(sourceLineups.published))
  /** Opened as published, and neither the lineup nor its settings changed since. */
  const publishedUnchanged =
    showsPublishedLineup &&
    !otherRoundChanged &&
    (loaded?.source === "published" && !changed
      ? settingsKey(settings) === loaded.settings
      : !settingsChanged)

  /** Save as draft — asking first when that takes a published lineup down. */
  function requestSaveDraft() {
    if (!result || result.teams.length === 0) return
    if (takenDownByDraft) setConfirmDraft(true)
    else saveDraft()
  }

  /**
   * Ending the session (idle, takeover) saves unsaved changes as a draft — except the published
   * lineup left as it was (even re-timed with other settings), which stays published.
   */
  const endSavesDraft =
    dirty && !(showsPublishedLineup && !otherRoundChanged && !restored) && result != null && result.teams.length > 0

  function saveDraft() {
    if (!result || result.teams.length === 0) return
    setConfirmDraft(false)
    onCommit(
      { kind: "draft", ...commitLineups(result), relayEvent: result.relay, optimal: isLoaded("optimal"), settings },
      guard.leave()
    )
  }

  /** End the edit session, handing over unsaved changes as a draft (like practices' autosave). */
  function endSession(reason: "takeover" | "idle") {
    if (sessionEndedRef.current) return
    sessionEndedRef.current = true
    // The published lineup left as it was (even re-timed with other settings) stays published —
    // a draft would take it down.
    const draft: RelayCommit | null =
      endSavesDraft && result
        ? { kind: "draft", ...commitLineups(result), relayEvent: result.relay, optimal: isLoaded("optimal"), settings }
        : null
    onSessionEnd(reason, draft, guard.leave())
  }
  const sessionEndedRef = useRef(false)
  const endSessionRef = useRef(endSession)
  useEffect(() => {
    endSessionRef.current = endSession
  })

  useEffect(() => {
    if (takeoverRequested) endSessionRef.current("takeover")
  }, [takeoverRequested])

  // Idle: no lineup or settings change for a while ends the session so the event isn't held. A
  // minute before, it warns with a way to keep editing; it waits while a dialog or inline editor
  // is open, since the coach is mid-change.
  const idlePaused =
    editing != null || loadOpen || athletePoolOpen || legOrderOpen || helpOpen || confirmPublish || confirmDraft || confirmTimedFinal || confirmDeleteDraft || confirmDeleteVersion != null || compare != null
  /** When the idle session ends, while its warning shows. */
  const [idleDeadline, setIdleDeadline] = useState<number | null>(null)
  /** "Keep editing" restarts the idle clock. */
  const [idleRestarts, setIdleRestarts] = useState(0)
  useEffect(() => {
    if (idlePaused) return
    const warn = window.setTimeout(
      () => setIdleDeadline(Date.now() + RELAY_EDIT_IDLE_WARNING_MS),
      RELAY_EDIT_IDLE_TIMEOUT_MS - RELAY_EDIT_IDLE_WARNING_MS
    )
    const end = window.setTimeout(() => endSessionRef.current("idle"), RELAY_EDIT_IDLE_TIMEOUT_MS)
    return () => {
      window.clearTimeout(warn)
      window.clearTimeout(end)
      setIdleDeadline(null)
    }
  }, [result, finalsTeams, settings, idlePaused, idleRestarts])

  function requestPublish() {
    if (!canPublish || !result) return
    if (result.teams.length === 0) return
    const { teams, finalsTeams } = roundLineups(result)
    // Only rounds not swum yet publish.
    const checks = splitRounds
      ? [
          ...(rounds.swum.P ? [] : [{ name: "prelims ", teams }]),
          ...(rounds.swum.F ? [] : [{ name: "finals ", teams: finalsTeams ?? teams }]),
        ]
      : [{ name: "", teams }]
    for (const { name, teams: lineup } of checks) {
      if (lineup.length === 0) {
        setError(`Add a ${name}relay first.`)
        return
      }
      const incomplete = lineup.find((t) => t.legs.length !== 4 || t.legs.some((l) => !l.athleteId))
      if (incomplete) {
        setError(`${incomplete.letter} ${name}relay is missing four athletes.`)
        return
      }
      const untimed = lineup.find((t) => t.legs.some((l) => l.timeMs == null))
      if (untimed) {
        setError(`Enter a time for every leg of the ${untimed.letter} ${name}relay first.`)
        return
      }
    }
    setError("")
    // Re-publishing the published lineup unchanged needs no confirmation; anything else does.
    if (publishedUnchanged) publish()
    else setConfirmPublish(true)
  }

  function publish() {
    if (!canPublish || !result) return
    setConfirmPublish(false)
    onCommit({ kind: "publish", ...commitLineups(result), relayEvent: result.relay, settings }, guard.leave())
  }

  /** Who saved the event's draft (or published lineup) and when. */
  const draftByLine = data.draft ? savedByLine(data.draft.savedBy, data.draft.savedAt) : null
  /** Optimal with the "Times from" window it's built with: "Optimal (1Y)"; all time is plain. */
  const optimalLabel = settings.limitDays == null ? "Optimal" : `Optimal (${timeWindowTag(settings.limitDays)})`
  const loadItems: { source: Source; label: string; detail?: string | null }[] = [
    { source: "optimal", label: optimalLabel },
    ...(publishedTeams.length > 0
      ? [{ source: "published" as const, label: "Published", detail: data.draft?.published ? draftByLine : null }]
      : []),
    ...(draftTeams ? [{ source: "draft" as const, label: "Draft", detail: draftByLine }] : []),
  ]
  /**
   * Earlier saves to load again, newest first — leaving out the newest when it's the draft or
   * published lineup already listed above.
   */
  const previousVersions = (data.versions ?? []).filter(
    (version, i) => !(i === 0 && data.draft && version.savedAt === data.draft.savedAt)
  )
  /** A version's lineups (both rounds), finals' own one null while it followed prelims. */
  const versionLineups = (version: RelaySlotVersion): RoundLineups => ({
    prelims: version.teams,
    finals: splitRounds ? independentFinals(version.teams, version.finalsTeams) : null,
  })
  /** A version's lineup is the one on screen. */
  const versionLoaded = (version: RelaySlotVersion) => showsLineup(versionLineups(version))

  /**
   * Load an earlier save — both rounds' lineups and its settings — as unsaved changes. Results can
   * lock "Prelims & finals"; otherwise it comes back as it was saved.
   */
  function loadVersion(version: RelaySlotVersion) {
    setLoadOpen(false)
    setEditing(null)
    const split = rounds.locked ? splitRounds : (version.prelimsFinals ?? (version.finalsTeams != null || splitRounds))
    setSplitRounds(split)
    setFinalsTeams(split ? independentFinals(version.teams, version.finalsTeams) : null)
    setRequest((r) => ({
      id: r.id + 1,
      settings: version.settings ?? r.settings,
      fixed: version.teams,
      count: version.teams.length,
      source: null,
      versionId: version.id,
    }))
  }
  const saveDraftLabel = takenDownByDraft ? "Save as draft and unpublish" : "Save as draft"
  /** What the edits are compared against: the lineup last loaded, else the published one. */
  const baselineSource: Source | null = loaded?.source ?? (publishedTeams.length > 0 ? "published" : null)
  const baseline = baselineSource ? sourceLineups[baselineSource] : null
  const finalsShown = splitRounds ? (finalsResult ?? result) : null
  /**
   * Editing a loaded lineup: that lineup, re-timed like the working one, to compare — per round
   * (finals against the loaded finals lineup). Null for a round that matches it.
   */
  const comparison = useMemo(() => {
    if (!baselineSource || !baseline || !result || result.teams.length === 0) return null
    const against = (shown: RelayResult, teams: LineupTeam[]) => {
      if (teams.length === 0 || lineupKey(lineupTeamsOf(shown)) === lineupKey(teams)) return null
      const published = applyLineupTeams(shown, teams, genderOf).teams
      return { published, byLetter: compareWithPublished(shown.teams, published) }
    }
    const P = against(result, baseline.prelims)
    const F = finalsShown ? against(finalsShown, baseline.finals ?? baseline.prelims) : null
    return P || F ? { source: baselineSource, P, F } : null
  }, [baselineSource, baseline, result, finalsShown, genderOf])
  // An option counts as loaded whenever the lineup on screen matches it — e.g. a saved draft that
  // is also the optimal lineup marks both.
  const isLoaded = (source: Source) =>
    // Saved lineups also hold their settings, so changing one leaves something to save either way.
    showsLineup(sourceLineups[source]) && (source === "optimal" || !settingsChanged)
  /** A lineup picked from the load menu that's still building: the menu checks it right away. */
  const pendingPick = loading && (request.source != null || request.versionId != null) ? request : null
  /** The load menu's check: the lineup being loaded, else whichever the lineup on screen matches. */
  const menuChecked = (source: Source) => (pendingPick ? pendingPick.source === source : isLoaded(source))
  const menuVersionChecked = (version: RelaySlotVersion) =>
    pendingPick ? pendingPick.versionId === version.id : versionLoaded(version)
  const poolIsCustom = settings.excludedIds.length > 0 || settings.addedIds.length > 0
  const editable = adding === 0
  const canAct = result != null && result.teams.length > 0 && !loading && editable && locked
  /** Re-timing a kept lineup (e.g. after a settings change): it stays on screen, dimmed, meanwhile. */
  const retiming = loading && request.fixed != null && result != null && result.teams.length > 0
  const retimingClass = retiming ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"

  const eventPicker = (
    <label className="relative -ml-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-fill focus-within:ring-[3px] focus-within:ring-primary/35">
      <select
        aria-label="Relay event"
        value={slot.slug}
        onChange={(e) => {
          // Unsaved changes: a full navigation, so the browser asks first.
          if (dirty) guard.guardedNavigate(`${relaysPath}?event=${encodeURIComponent(e.target.value)}`)
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
      <span className={`${relayEyebrowClass} min-w-0 truncate`} aria-hidden>
        {slot.label}
      </span>
      <AppIcon name="chevronDown" strokeWidth={2.5} className="h-3.5 w-3.5 shrink-0 text-accent" />
    </label>
  )

  /** Timed Finals or Prelim/Final, beside the event; results lock it. */
  /** Changeable while a lineup is still loading. */
  const roundsDisabled = !editable || rounds.locked != null || compare != null
  const roundsLabel = splitRounds ? "Prelim/Final" : "Timed Finals"
  const roundsPicker = (
    <label
      title={
        rounds.locked === "rounds"
          ? "Results are split by round"
          : rounds.locked
            ? "Results are a timed final"
            : compare
              ? "Close the comparison to change this"
              : undefined
      }
      className={`relative inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors focus-within:ring-[3px] focus-within:ring-primary/35 ${
        roundsDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-fill"
      }`}
    >
      <select
        aria-label="Rounds"
        value={splitRounds ? "rounds" : "timed"}
        disabled={roundsDisabled}
        onChange={(e) => requestPrelimsFinals(e.target.value === "rounds")}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        <option value="timed" className="bg-background text-foreground">
          Timed Finals
        </option>
        <option value="rounds" className="bg-background text-foreground">
          Prelim/Final
        </option>
      </select>
      <span className={relayEyebrowClass} aria-hidden>
        {roundsLabel}
      </span>
      <AppIcon name="chevronDown" strokeWidth={2.5} className="h-3.5 w-3.5 shrink-0 text-accent" />
    </label>
  )

  /** What's on screen — the round shown, at a finals meet — and whether it has unsaved changes. */
  const draftStatus = (() => {
    const draft = pendingDraft(data)
    const at = draft ? savedAtLabel(draft.savedAt) : null
    return at ? `Draft · ${at}` : "Draft"
  })()
  /**
   * While a lineup is still building, what it's loading — known from the relays page's data, so
   * the status never waits on the build (or on the edit lock).
   */
  const loadingStatus = (() => {
    if (restored) return "Not saved"
    const source = request.source ?? loaded?.source ?? "optimal"
    return source === "draft" ? draftStatus : source === "published" ? "Published" : optimalLabel
  })()
  const lineupStatus = (() => {
    if (loading && !retiming) return loadingStatus
    if (!result || result.teams.length === 0) return loadingStatus
    if (restored) return "Not saved"
    if (showsPublishedLineup) return "Published"
    if (draftTeams && isLoaded("draft")) return draftStatus
    if (isLoaded("optimal")) return optimalLabel
    return "Edited"
  })()
  /**
   * What the menu can delete: the saved draft, else the lineup the builder published (athletes
   * see it now) with its settings. Imported relays and relays with results can't be deleted here.
   */
  const deletable: "draft" | "published" | null = pendingDraft(data) ? "draft" : takenDownByDraft ? "published" : null

  async function deleteDraft() {
    if (!onDeleteDraft || deletingDraft || !deletable) return
    setDeletingDraft(true)
    setDeleteDraftError("")
    const failure = await onDeleteDraft(deletable === "published")
    if (failure) {
      setDeletingDraft(false)
      setDeleteDraftError(failure)
      return
    }
    // The builder reopens on the optimal lineup; drop the unsaved-changes history entry.
    if (guard.leave()) window.history.back()
  }

  async function deleteVersion() {
    if (!onDeleteVersion || !confirmDeleteVersion || deletingVersion) return
    setDeletingVersion(true)
    setDeleteVersionError("")
    const failure = await onDeleteVersion(confirmDeleteVersion.id)
    setDeletingVersion(false)
    if (failure) setDeleteVersionError(failure)
    else setConfirmDeleteVersion(null)
  }

  /**
   * A lineup from the status menu with its saved times; legs saved without one (a published
   * lineup records only who swims) are timed like the lineup on screen.
   */
  function withTimes(teams: LineupTeam[]): LineupTeam[] {
    if (!result) return teams
    const timed = lineupTeamsOf(applyLineupTeams(result, teams, genderOf))
    return teams.map((team, t) => ({
      ...team,
      legs: team.legs.map((leg, i) => (leg.timeMs != null ? leg : { ...leg, timeMs: timed[t]?.legs[i]?.timeMs ?? null })),
    }))
  }

  /** Builder settings in brief, for a comparison's columns: "Times 1Y · prefer 6M · 24 athletes". */
  function settingsSummary(s: BuildSettings | null | undefined): string | null {
    if (!s) return null
    const count = refinedPoolFor(athletes, gender, event, s, signupRelayPrefs).included.length
    const parts = [`Times ${timeWindowTag(s.limitDays)}`]
    if (windowDays(s.withinDays) < windowDays(s.limitDays)) parts.push(`prefer ${timeWindowTag(s.withinDays)}`)
    parts.push(`${count} ${count === 1 ? "athlete" : "athletes"}`)
    if (!isMedleyRelay(event) && s.legOrder) parts.push("Custom leg order")
    return parts.join(" · ")
  }

  /**
   * Both rounds' relays as one list for a comparison — "A-P", "A-F", … — finals following prelims
   * shown as the prelims lineup. Just the lineup without rounds.
   */
  function compareTeams(lineup: RoundLineups, timed: (teams: LineupTeam[]) => LineupTeam[]): LineupTeam[] {
    const prelims = timed(lineup.prelims)
    if (!splitRounds) return prelims
    const finals = lineup.finals ? timed(lineup.finals) : prelims
    return [
      ...prelims.map((team) => ({ ...team, letter: `${team.letter}-P` })),
      ...finals.map((team) => ({ ...team, letter: `${team.letter}-F` })),
    ]
  }

  /** Compare the lineups on screen with `side`'s (from the status menu), side by side. */
  function openCompare(side: Omit<CompareSide, "teams">, lineup: RoundLineups, loadSide: () => void) {
    setLoadOpen(false)
    setEditing(null)
    setCompare({ side: { ...side, teams: compareTeams(lineup, withTimes) }, load: loadSide })
  }

  /** The status, which opens the lineups to load and deleting the saved draft. */
  const statusMenu = (
    <span className="inline-flex min-w-0 items-center gap-2.5 text-sm text-foreground-secondary">
      <span className="relative min-w-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={loadOpen}
          aria-label={`${lineupStatus}: load a lineup`}
          onClick={() => setLoadOpen(!loadOpen)}
          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-fill hover:text-foreground"
        >
          <span aria-live="polite" className="truncate">
            {lineupStatus}
          </span>
          <AppIcon name="chevronDown" className="h-3 w-3 shrink-0" />
        </button>
        {loadOpen ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setLoadOpen(false)} />
            <div
              role="menu"
              className="absolute left-0 top-[calc(100%+6px)] z-[41] flex w-max min-w-[180px] max-w-[calc(100vw-32px)] flex-col gap-0.5 rounded-xl border border-border bg-background p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
            >
              {loadItems.map((item) => {
                const trash =
                  item.source === "draft" && deletable === "draft"
                    ? "Delete draft"
                    : item.source === "published" && deletable === "published"
                      ? "Delete published lineup"
                      : null
                return (
                  <MenuRow
                    key={item.source}
                    label={item.label}
                    detail={item.detail}
                    loaded={menuChecked(item.source)}
                    onLoad={() => load(item.source)}
                    onCompare={
                      menuChecked(item.source) || !sourceLineups[item.source] || !result
                        ? undefined
                        : () =>
                            openCompare(
                              {
                                label: item.label,
                                detail: item.detail,
                                // Optimal is built at the settings on screen; saved lineups keep theirs.
                                settings: settingsSummary(
                                  item.source === "optimal"
                                    ? settings
                                    : item.source === "draft" || data.draft?.published
                                      ? data.draft?.settings
                                      : null
                                ),
                              },
                              sourceLineups[item.source] ?? { prelims: [], finals: null },
                              () => load(item.source)
                            )
                    }
                    deleteLabel={trash && onDeleteDraft ? trash : null}
                    deleteDisabled={!locked}
                    onDelete={() => {
                      setLoadOpen(false)
                      setDeleteDraftError("")
                      setConfirmDeleteDraft(true)
                    }}
                  />
                )
              })}
              {previousVersions.length > 0 ? (
                <>
                  {previousVersions.map((version) => (
                    <MenuRow
                      key={version.id}
                      label={version.published ? "Published" : "Draft"}
                      detail={savedByLine(version.savedBy, version.savedAt)}
                      loaded={menuVersionChecked(version)}
                      onLoad={() => loadVersion(version)}
                      onCompare={
                        menuVersionChecked(version) || !result
                          ? undefined
                          : () =>
                              openCompare(
                                {
                                  label: version.published ? "Published" : "Draft",
                                  detail: savedByLine(version.savedBy, version.savedAt),
                                  settings: settingsSummary(version.settings),
                                },
                                versionLineups(version),
                                () => loadVersion(version)
                              )
                      }
                      deleteLabel={onDeleteVersion ? "Delete this version" : null}
                      deleteDisabled={!locked}
                      onDelete={() => {
                        setLoadOpen(false)
                        setDeleteVersionError("")
                        setConfirmDeleteVersion(version)
                      }}
                    />
                  ))}
                </>
              ) : null}
            </div>
          </>
        ) : null}
      </span>
    </span>
  )

  const actions = (
    <>
      <button
        type="button"
        aria-label={saveDraftLabel}
        onClick={requestSaveDraft}
        disabled={!canAct}
        className={`${iconButtonClass} border border-fill text-foreground hover:bg-fill-secondary`}
      >
        <ActionIcon kind="check" className="h-4 w-4" />
        <HoverDetail label={saveDraftLabel} />
      </button>
      {canPublish ? (
        <button
          type="button"
          aria-label="Publish"
          onClick={requestPublish}
          disabled={!canAct}
          className={`${iconButtonClass} bg-primary text-primary-contrast hover:bg-primary-hover disabled:hover:bg-primary`}
        >
          <ActionIcon kind="publish" className="h-4 w-4" />
          <HoverDetail label="Publish" />
        </button>
      ) : null}
    </>
  )

  const medley = isMedleyRelay(event)
  // Every unused swimmer is kept as an alternate; each list shows a few until "Show more" reveals all.
  const shown = ALTERNATES_SHOWN[medley ? "medley" : "free"]
  const strokeLabels = new Map(medleyStrokeGroups(event).map((g) => [g.stroke, g.label]))
  const roundsShown: BuilderRound[] = splitRounds ? ["P", "F"] : ["P"]
  /**
   * The relay cards: each letter's prelims card then its finals card (finals following prelims
   * shows the prelims relays), or one card per relay without rounds.
   */
  const relayCards = (() => {
    if (!result) return []
    const lineups = roundsShown.map((r) => ({ round: r, teams: roundResult(r)?.teams ?? [] }))
    const letters = RELAY_LETTERS.filter((letter) =>
      lineups.some(({ teams }) => teams.some((team) => team.letter === letter))
    )
    return letters.flatMap((letter) =>
      lineups.map(({ round: r, teams }) => ({ round: r, letter, team: teams.find((t) => t.letter === letter) ?? null }))
    )
  })()
  /** Cards and placeholders while building. */
  const skeletonCount = Math.min(Math.max(teamCount, 1), 4) * roundsShown.length
  /**
   * Alternates: one list of swimmers on no relay in either round (prelims' alternates, less anyone
   * on a finals relay), indexed like prelims' list. Dropping one on a card swaps them into that
   * card's round only.
   */
  const finalsUsed = new Set(finalsResult?.teams.flatMap((team) => team.legs.map((leg) => leg.athleteId)) ?? [])
  const alternateRows = (result?.alternates ?? [])
    .map((alt, index) => ({ alt, index }))
    .filter(({ alt }) => !finalsUsed.has(alt.athleteId))
  const alternates = alternateRows.map(({ alt }) => alt)
  const groups = alternateGroups(alternates, medley, mixed, (key) => (expandedAlternates[key] ? Infinity : shown)).map(
    (group) => ({
      ...group,
      label: strokeLabels.get(group.key) ?? group.key,
      // Back to indexes in prelims' alternates.
      rows: group.rows.map(({ alt, index }) => ({ alt, index: alternateRows[index].index })),
    })
  )
  /** A swimmer can still swap into a round without results. */
  const alternatesDraggable = editable && !(roundSwum("P") && roundSwum("F"))

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
              if (dirty || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              onExit(null, guard.leave())
            }}
          >
            ← Relays
          </Link>
        }
        eyebrow={
          <>
            {eventPicker}
            {roundsPicker}
            {statusMenu}
          </>
        }
        actions={actions}
      />

      {banner}
      {newerSaved ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-fill-secondary px-4 py-3 text-sm text-foreground"
        >
          <p>{slot.label} was saved elsewhere since you opened it. Your changes here aren&apos;t saved.</p>
          <button
            type="button"
            onClick={() => {
              // Drop the unsaved-changes history entry, then show the saved lineup.
              if (guard.leave()) window.history.back()
              onLoadNewer?.()
            }}
            className="shrink-0 font-medium text-accent hover:underline"
          >
            Discard mine and show theirs
          </button>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-4">
        {/* Locked while comparing, so the lineup on screen can't change under the comparison. */}
        <fieldset
          aria-label="Builder settings"
          disabled={compare != null}
          title={compare ? "Close the comparison to change settings" : undefined}
          className="m-0 flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2 border-0 p-0 pb-1 transition-opacity disabled:opacity-50"
        >
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

          {/* Phones: the rest of the settings on demand, summed up on the button. */}
          <button
            type="button"
            aria-expanded={settingsOpen}
            aria-controls={settingsId}
            onClick={() => setSettingsOpen((open) => !open)}
            className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-fill sm:hidden"
          >
            Settings
            <span className="truncate text-foreground-secondary">
              · {TIME_WINDOWS.find((w) => w.days === settings.limitDays)?.label ?? "Custom"} · {includedAthletes.length}{" "}
              {includedAthletes.length === 1 ? "athlete" : "athletes"}
            </span>
            <AppIcon
              name="chevronDown"
              className={`h-3 w-3 shrink-0 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
            />
          </button>

          <div id={settingsId} className={settingsOpen ? "contents" : "hidden sm:contents"}>
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

          {!isMedleyRelay(event) ? (
            <SettingsField label="Leg order">
              <LegOrderDropdown
                order={settings.legOrder ?? null}
                open={legOrderOpen}
                onOpenChange={setLegOrderOpen}
                orderDisabled={!editable}
                mixed={mixed}
                onChange={(legOrder) => updateSettings({ legOrder })}
              />
            </SettingsField>
          ) : null}

          {hasSignups ? (
            <SettingsField label="Athlete pool">
              <SelectControl
                label="Athlete pool"
                value={poolIsCustom ? "custom" : settings.signupPool}
                onChange={(value) => {
                  // "Custom" only reflects the filtered list; picking a preset resets it.
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
          </div>

          <span className="ml-auto self-end text-xs leading-9 text-foreground-secondary pointer-coarse:hidden">
            Drag to swap. Click a name or time to change it.
          </span>
          {/* Touch screens: dragging is unreliable, and picking a swimmer already in the lineup swaps them. */}
          <span className="hidden w-full text-xs text-foreground-secondary pointer-coarse:inline">
            Tap a name to swap swimmers, or a time to change it.
          </span>
        </fieldset>

        {splitRounds && finalsTeams ? (
          <p className="-mt-2 text-xs text-foreground-secondary">
            Finals has its own lineup.{" "}
            <button
              type="button"
              onClick={followPrelims}
              disabled={loading || !editable || roundSwum("F")}
              className="font-medium text-accent hover:underline disabled:opacity-50"
            >
              Use the prelims lineup
            </button>
          </p>
        ) : null}

        {error ? <p className="text-sm text-error">{error}</p> : null}

        {compare && result && result.teams.length > 0 ? (
          <RelayCompareView
            left={{
              label: "Current Version",
              // Where the lineup came from (Published, Draft, Optimal…); a hand-edited one needs no note.
              detail: lineupStatus === "Edited" ? null : lineupStatus,
              settings: settingsSummary(settings),
              teams: compareTeams(
                { prelims: lineupTeamsOf(result), finals: finalsResult ? lineupTeamsOf(finalsResult) : null },
                (teams) => teams
              ),
            }}
            right={compare.side}
            relayTitle={(key) => {
              const [letter, r] = key.split("-")
              return `${letter} Relay${r === "P" || r === "F" ? ` · ${ROUND_NAME[r]}` : ""}`
            }}
            legLabels={result.teams[0]?.legs.map((leg) => leg.event) ?? []}
            loadDisabled={!editable}
            onLoadRight={() => {
              compare.load()
              setCompare(null)
            }}
            onClose={() => setCompare(null)}
          />
        ) : loading && !retiming ? (
          <div role="status" aria-live="polite" aria-label="Building relay teams" className="flex flex-col gap-4">
            <span className="sr-only">Building relay teams</span>
            <div className={`grid items-start gap-3 ${relayGridCols(skeletonCount)}`}>
              {Array.from({ length: skeletonCount }, (_, t) => (
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
            <div
              aria-busy={retiming}
              className={`grid items-start gap-3 ${relayGridCols(relayCards.length + adding * roundsShown.length)} ${retimingClass}`}
            >
              {relayCards.map(({ round: r, letter, team }) => {
                const title = `${letter} Relay${splitRounds ? ` · ${ROUND_NAME[r]}` : ""}`
                if (!team) {
                  // Keeps the rounds paired when one round has a relay the other doesn't.
                  return (
                    <p
                      key={`${r}-${letter}`}
                      className="rounded-lg border border-dashed border-border px-3.5 py-2.5 text-sm text-foreground-secondary"
                    >
                      No {letter} {ROUND_NAME[r].toLowerCase()} relay
                    </p>
                  )
                }
                const following = splitRounds && r === "F" && !finalsTeams
                const swum = roundSwum(r)
                const cardEditable = editable && !swum
                const compared = comparison?.[r]?.byLetter.get(team.letter)
                // A finals card following prelims is dashed; its header has no room to say so.
                const tag = swum ? "Results in" : null
                return (
                  <div
                    key={`${r}-${team.letter}`}
                    title={following ? "Same as prelims until you change it" : undefined}
                    className={`min-w-0 rounded-lg border border-border bg-background ${following ? "border-dashed" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-2 border-b border-border px-3.5 py-2.5 text-[15px] font-medium text-foreground">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="shrink-0">{title}</span>
                        {tag ? (
                          <span title={tag} className="truncate text-[11px] font-normal text-foreground-secondary">
                            {tag}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        {compared?.diffMs != null && comparison ? (
                          <span
                            title={`Projected difference from the ${BASELINE_TEXT[comparison.source].relay}`}
                            className={
                              "font-mono text-xs tabular-nums " +
                              (compared.diffMs < 0
                                ? "text-success-text"
                                : compared.diffMs > 0
                                  ? "text-error"
                                  : "text-foreground-secondary")
                            }
                          >
                            {formatTimeDiff(compared.diffMs)}
                          </span>
                        ) : null}
                        <span className="font-mono tabular-nums">{formatLegTime(team.totalMs)}</span>
                      </span>
                    </div>
                    <div>
                      {team.legs.map((leg, i) => {
                        const at: RoundLoc = { round: r, loc: { list: "team", letter: team.letter, index: i } }
                        const key = roundLocKey(at)
                        const editingField = editing?.key === key ? editing.field : null
                        const draggable = cardEditable && editingField == null
                        const changedLeg = compared?.changedLegs.includes(i) === true
                        const replaced = changedLeg ? compared?.published?.legs[i]?.name : undefined
                        return (
                          <div
                            key={leg.athleteId || key}
                            ref={(element) => {
                              if (element) relayRowRefs.current.set(`${r}:${leg.athleteId}`, element)
                              else relayRowRefs.current.delete(`${r}:${leg.athleteId}`)
                            }}
                            draggable={draggable}
                            onDragStart={(e) => handleRowDragStart(e, at)}
                            onDragOver={(e) => handleRowDragOver(e, at)}
                            onDragLeave={(e) => handleRowDragLeave(e, at)}
                            onDrop={(e) => handleRowDrop(e, at)}
                            onDragEnd={endDrag}
                            className={`flex items-center justify-between gap-2.5 border-t border-border px-3 py-1.5 first:border-t-0 last:rounded-b-lg ${changedLeg ? "border-l-2 border-l-primary " : ""}${dragStateClass(at, draggable)}`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                                  {editingField === "name" ? (
                                    <LegNameEditor
                                      initialName={leg.name}
                                      candidates={legCandidates(r, team.letter, i)}
                                      onPick={(athlete) => pickLegAthlete(r, team.letter, i, athlete)}
                                      onCancel={() => setEditing(null)}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditing({ key, field: "name" })}
                                      disabled={!cardEditable}
                                      title={cardEditable ? "Change swimmer" : undefined}
                                      className="-mx-1 min-w-0 cursor-text! truncate rounded px-1 text-left transition-colors hover:bg-background-hover disabled:cursor-default! disabled:hover:bg-transparent"
                                    >
                                      {leg.name}
                                    </button>
                                  )}
                                  {mixed ? <GenderTag gender={leg.gender} /> : null}
                                </div>
                                <p className="text-xs text-foreground-secondary">
                                  {leg.event}
                                  {replaced ? <span className="text-accent">{` · was ${replaced}`}</span> : null}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end text-right leading-tight">
                              {editingField === "time" ? (
                                <LegTimeEditor
                                  timeMs={leg.timeMs}
                                  onSave={(timeMs) => saveLegTime(r, team.letter, i, timeMs)}
                                  onCancel={() => setEditing(null)}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditing({ key, field: "time" })}
                                  disabled={!cardEditable}
                                  title={cardEditable ? "Enter a custom time" : undefined}
                                  className={
                                    "-mx-1 cursor-text! rounded px-1 font-mono text-[13px] tabular-nums transition-colors hover:bg-background-hover disabled:cursor-default! disabled:hover:bg-transparent " +
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
                )
              })}
              {Array.from({ length: adding * roundsShown.length }, (_, t) => (
                <RelayCardSkeleton key={`adding-${t}`} />
              ))}
            </div>

            {retiming && (result.alternates ?? []).length === 0 ? (
              // A saved lineup shown before its build: alternates arrive with the build.
              <div aria-hidden>
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
            ) : null}

            {alternates.length > 0 ? (
              <div className={retimingClass}>
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
                          const at: RoundLoc = { round: "P", loc: { list: "alt", index } }
                          return (
                            <div
                              key={`${alt.athleteId}-${alt.event}-${index}`}
                              ref={(element) => {
                                // Keyed like a prelims relay row, so a swap into prelims animates across.
                                if (element) relayRowRefs.current.set(`P:${alt.athleteId}`, element)
                                else relayRowRefs.current.delete(`P:${alt.athleteId}`)
                              }}
                              draggable={alternatesDraggable}
                              onDragStart={(e) => handleRowDragStart(e, at)}
                              onDragOver={(e) => handleRowDragOver(e, at)}
                              onDragLeave={(e) => handleRowDragLeave(e, at)}
                              onDrop={(e) => handleRowDrop(e, at)}
                              onDragEnd={endDrag}
                              className={`flex items-center justify-between gap-3 border-t border-border px-3 py-2 first:border-t-0 ${dragStateClass(at, alternatesDraggable)}`}
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
        maxWidth="lg"
        // Title with the count under it, and Include all / Exclude all centered beside both — in the
        // header, so they stay put while the list scrolls.
        header={
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <h2 className="text-lg font-medium text-foreground">Filter athletes</h2>
              <p className="text-xs text-foreground-secondary">
                {includedAthletes.length} of {poolAthletes.length} included
              </p>
            </div>
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
        }
        headerClassName="pb-0!"
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
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-1.5 transition-colors " +
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
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-accent">
                      {name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{name}</p>
                      {mixed && athlete.gender ? (
                        <p className="text-xs text-foreground-secondary">{athlete.gender}</p>
                      ) : null}
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
        title={hasPublishedLineup ? `Update the published ${slot.label}?` : `Publish ${slot.label}?`}
        description={
          hasPublishedLineup
            ? "Athletes will see the new lineup on the Relays page."
            : "Athletes will see it on the Relays page."
        }
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

      <Modal
        open={confirmDraft}
        onClose={() => setConfirmDraft(false)}
        title={`Unpublish ${slot.label}?`}
        description={`Saving a draft takes down ${takenDownByDraft ?? "the published lineup"}. Athletes won't see it until you publish again.`}
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDraft(false)}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover"
            >
              Save draft and unpublish
            </button>
          </ModalFooter>
        }
      />

      <Modal
        open={confirmDeleteDraft}
        onClose={() => {
          if (!deletingDraft) setConfirmDeleteDraft(false)
        }}
        closeDisabled={deletingDraft}
        title={deletable === "published" ? "Delete published lineup?" : "Delete draft?"}
        description={`${
          deletable === "published"
            ? `This unpublishes ${takenDownByDraft ?? "the published lineup"} for ${slot.label}, so athletes won't see it, and deletes its builder settings.`
            : `The ${slot.label} draft and its builder settings will be deleted.`
        } The builder goes back to the optimal lineup.${dirty ? " Your unsaved changes will be lost too." : ""}`}
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDeleteDraft(false)}
              disabled={deletingDraft}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void deleteDraft()}
              disabled={deletingDraft}
              className="flex-1 rounded-lg border border-error-border px-4 py-2.5 text-sm font-medium text-error hover:bg-error-bg disabled:opacity-50"
            >
              {deletingDraft ? "Deleting…" : deletable === "published" ? "Delete and unpublish" : "Delete draft"}
            </button>
          </ModalFooter>
        }
      >
        {deleteDraftError ? <p className="text-sm text-error">{deleteDraftError}</p> : null}
      </Modal>

      <Modal
        open={confirmDeleteVersion != null}
        onClose={() => {
          if (!deletingVersion) setConfirmDeleteVersion(null)
        }}
        closeDisabled={deletingVersion}
        title="Delete this version?"
        description={
          confirmDeleteVersion
            ? `The ${confirmDeleteVersion.published ? "published" : "draft"} version of ${slot.label}${(() => {
                const by = savedByLine(confirmDeleteVersion.savedBy, confirmDeleteVersion.savedAt)
                return by ? ` (${by})` : ""
              })()} will be removed from Previous versions. The lineup on screen doesn't change.`
            : undefined
        }
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmDeleteVersion(null)}
              disabled={deletingVersion}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void deleteVersion()}
              disabled={deletingVersion}
              className="flex-1 rounded-lg border border-error-border px-4 py-2.5 text-sm font-medium text-error hover:bg-error-bg disabled:opacity-50"
            >
              {deletingVersion ? "Deleting…" : "Delete version"}
            </button>
          </ModalFooter>
        }
      >
        {deleteVersionError ? <p className="text-sm text-error">{deleteVersionError}</p> : null}
      </Modal>

      <Modal
        open={confirmTimedFinal}
        onClose={() => setConfirmTimedFinal(false)}
        title={`Make ${slot.label.replace(/^(Women's|Men's) /, "")} a timed final?`}
        description={(() => {
          const lineups = [
            ...(finalsTeams ? [`the ${slot.label} finals lineup`] : []),
            ...(siblingFinals ? [`the ${siblingFinals} finals lineup`] : []),
          ]
          return `The prelims lineup becomes the only lineup, and ${lineups.join(" and ")} will be deleted when you save.`
        })()}
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setConfirmTimedFinal(false)}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={makeTimedFinal}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover"
            >
              Make timed final
            </button>
          </ModalFooter>
        }
      />

      <Modal
        open={idleDeadline != null}
        onClose={() => setIdleRestarts((n) => n + 1)}
        title="Still editing?"
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setIdleRestarts((n) => n + 1)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover"
            >
              Keep editing
            </button>
          </ModalFooter>
        }
      >
        <p className="text-sm text-foreground-secondary">
          Nothing has changed in a while, so this edit session ends in{" "}
          {idleDeadline != null ? <IdleCountdown deadline={idleDeadline} /> : null} and {slot.label} is free for
          other coaches.{" "}
          {endSavesDraft
            ? takenDownByDraft
              ? `Your changes will be saved as a draft, which takes down ${takenDownByDraft} until it's published again.`
              : "Your changes will be saved as a draft."
            : null}
        </p>
      </Modal>
    </main>
  )
}
