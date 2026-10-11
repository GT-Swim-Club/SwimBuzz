"use client"

import { formatSeasonLabel, type IconName } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { SegmentedToggle, segmentedIconOptionClass } from "@/components/ui/SegmentedToggle"
import { useMeetsFilters } from "./use-meets-filters"
import { useMeetsLayout } from "./use-meets-layout"
import { useToolbarCondensed } from "./MeetsToolbar"

const TRASH = "__trash"

const selectClass =
  "h-[42px] cursor-pointer appearance-none rounded-lg border border-border bg-background pl-3 pr-9 text-sm tabular-nums text-foreground"

/**
 * A toolbar dropdown. When the toolbar is condensed (see MeetsToolbar) it
 * shrinks to an icon button — the real select sits invisibly over the icon,
 * so tapping it still opens the native picker. A dot marks a non-default value.
 */
function ToolbarSelect({
  label,
  value,
  onChange,
  icon,
  current,
  active,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  icon: IconName
  /** The selected option's label, shown on hover while condensed. */
  current: string
  /** Narrowed from the default (gets a dot while condensed). */
  active: boolean
  children: React.ReactNode
}) {
  const condensed = useToolbarCondensed()
  return (
    <div className="relative inline-flex shrink-0">
      {/* Width probe: the full select's natural width, which MeetsToolbar
          reads to decide whether the full controls would fit — in either mode,
          so the switch can't flip-flop. Clipped to nothing so it never adds
          scroll overflow. */}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
        <select data-measure tabIndex={-1} value={value} onChange={() => {}} className={selectClass}>
          {children}
        </select>
      </div>
      {condensed ? (
        <div className="group relative flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors focus-within:border-primary hover:bg-fill-secondary">
          <AppIcon name={icon} className="h-4 w-4" />
          {active && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
          <select
            aria-label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer appearance-none opacity-0"
          >
            {children}
          </select>
          <HoverDetail label={current} />
        </div>
      ) : (
        <>
          <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
            {children}
          </select>
          <AppIcon
            name="chevronDown"
            className="pointer-events-none absolute right-3 top-[13px] h-4 w-4 text-foreground-secondary"
          />
        </>
      )}
    </div>
  )
}

/** Gallery/List switch — applies to Trash too, so it stays visible there. */
function LayoutToggle() {
  const { layout, setLayout } = useMeetsLayout()
  return (
    <SegmentedToggle
      selectedIndex={layout === "list" ? 1 : 0}
      className="h-[42px] shrink-0 rounded-lg border border-border bg-background"
    >
      {(["gallery", "list"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setLayout(value)}
          aria-label={value === "list" ? "List view" : "Gallery view"}
          aria-pressed={layout === value}
          className={"group relative " + segmentedIconOptionClass(layout === value)}
        >
          <AppIcon name={value} className="h-4 w-4 shrink-0" />
          <HoverDetail label={value === "list" ? "List" : "Gallery"} />
        </button>
      ))}
    </SegmentedToggle>
  )
}

/**
 * Season (with Trash for staff) and All/My meets selects. Filters live in the
 * URL but update it in place (see useMeetsFilters), so switching is instant.
 * Then the Gallery/List toggle; `children` (the New meet button) is hidden
 * while viewing Trash.
 */
export default function MeetsToolbarSelects({
  seasons,
  showTrash,
  showScope,
  children,
}: {
  seasons: string[]
  showTrash: boolean
  showScope: boolean
  children?: React.ReactNode
}) {
  const { season, scope, inTrash: trashParam, setFilters } = useMeetsFilters()
  const inTrash = showTrash && trashParam

  return (
    <>
      <ToolbarSelect
        label="Season"
        icon={inTrash ? "trash" : "calendar"}
        current={inTrash ? "Trash" : season ? formatSeasonLabel(season) : "All seasons"}
        active={!!season && !inTrash}
        value={inTrash ? TRASH : (season ?? "all")}
        onChange={(v) =>
          v === TRASH
            ? setFilters({ view: "deleted", season: null })
            : setFilters({ view: null, season: v === "all" ? null : v })
        }
      >
        <option value="all">All seasons</option>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {formatSeasonLabel(s)}
          </option>
        ))}
        {showTrash && <option value={TRASH}>Trash</option>}
      </ToolbarSelect>
      {showScope && !inTrash && (
        <ToolbarSelect
          label="Show meets"
          icon={scope === "mine" ? "user" : "roster"}
          current={scope === "mine" ? "My meets" : "All meets"}
          active={scope === "mine"}
          value={scope}
          onChange={(v) => setFilters({ scope: v === "mine" ? "mine" : null })}
        >
          <option value="all">All meets</option>
          <option value="mine">My meets</option>
        </ToolbarSelect>
      )}
      <LayoutToggle />
      {!inTrash && children}
    </>
  )
}
