"use client"

import { formatSeasonLabel } from "@swimbuzz/shared"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { ListLayoutToggle } from "@/components/ui/ListLayout"
import { useMeetsFilters } from "./use-meets-filters"

const TRASH = "__trash"

/**
 * Season and All/My meets (with Trash for staff) selects. Filters live in the
 * URL but update it in place (see useMeetsFilters), so switching is instant.
 * Then the List/Gallery toggle; the Season select and `children` (the New meet
 * button) are hidden while viewing Trash.
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
      {!inTrash && (
        <ToolbarSelect
          label="Season"
          icon="calendar"
          current={season ? formatSeasonLabel(season) : "All seasons"}
          active={!!season}
          value={season ?? "all"}
          onChange={(v) => setFilters({ season: v === "all" ? null : v })}
        >
          <option value="all">All seasons</option>
          {seasons.map((s) => (
            <option key={s} value={s}>
              {formatSeasonLabel(s)}
            </option>
          ))}
        </ToolbarSelect>
      )}
      {(showScope || showTrash) && (
        <ToolbarSelect
          label="Show meets"
          icon={inTrash ? "trash" : scope === "mine" ? "user" : "roster"}
          current={inTrash ? "Trash" : scope === "mine" ? "My meets" : "All meets"}
          active={inTrash || scope === "mine"}
          value={inTrash ? TRASH : scope}
          onChange={(v) =>
            v === TRASH
              ? setFilters({ view: "deleted", scope: null })
              : setFilters({ view: null, scope: v === "mine" ? "mine" : null })
          }
        >
          <option value="all">All meets</option>
          {showScope && <option value="mine">My meets</option>}
          {showTrash && <option value={TRASH}>Trash</option>}
        </ToolbarSelect>
      )}
      <ListLayoutToggle />
      {!inTrash && children}
    </>
  )
}
