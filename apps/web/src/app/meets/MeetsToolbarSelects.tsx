"use client"

import { formatSeasonLabel } from "@swimbuzz/shared"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { ListLayoutToggle } from "@/components/ui/ListLayout"
import { useMeetsFilters } from "./use-meets-filters"

const TRASH = "__trash"

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
      <ListLayoutToggle />
      {!inTrash && children}
    </>
  )
}
