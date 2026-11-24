"use client"

import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { ListLayoutToggle } from "@/components/ui/ListLayout"
import { useMeetsFilters } from "./use-meets-filters"

const TRASH = "__trash"

/**
 * The All/My meets (with Trash for staff) select. The filter lives in the URL
 * but updates it in place (see useMeetsFilters), so switching is instant.
 * Then the List/Gallery toggle; `children` (the New meet button) is hidden
 * while viewing Trash.
 */
export default function MeetsToolbarSelects({
  showTrash,
  showScope,
  children,
}: {
  showTrash: boolean
  showScope: boolean
  children?: React.ReactNode
}) {
  const { scope, inTrash: trashParam, setFilters } = useMeetsFilters()
  const inTrash = showTrash && trashParam

  return (
    <>
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
