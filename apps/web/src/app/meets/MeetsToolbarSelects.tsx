"use client"

import { formatSeasonLabel } from "@swimbuzz/shared"
import { AppIcon } from "@/components/ui/AppIcon"
import { useMeetsFilters } from "./use-meets-filters"

const TRASH = "__trash"

function ToolbarSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="relative inline-flex shrink-0">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[42px] cursor-pointer appearance-none rounded-lg border border-border bg-background pl-3 pr-9 text-sm tabular-nums text-foreground"
      >
        {children}
      </select>
      <AppIcon
        name="chevronDown"
        className="pointer-events-none absolute right-3 top-[13px] h-4 w-4 text-foreground-secondary"
      />
    </div>
  )
}

/**
 * Season (with Trash for staff) and All/My meets selects. Filters live in the
 * URL but update it in place (see useMeetsFilters), so switching is instant.
 * `children` (the New meet button) is hidden while viewing Trash.
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
          value={scope}
          onChange={(v) => setFilters({ scope: v === "mine" ? "mine" : null })}
        >
          <option value="all">All meets</option>
          <option value="mine">My meets</option>
        </ToolbarSelect>
      )}
      {!inTrash && children}
    </>
  )
}
