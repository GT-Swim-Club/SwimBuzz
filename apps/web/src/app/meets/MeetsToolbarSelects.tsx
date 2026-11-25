"use client"

import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { ListLayoutToggle } from "@/components/ui/ListLayout"
import { useMeetsFilters } from "./use-meets-filters"

const TRASH = "__trash"

/**
 * The All/My meets (with No results and Trash for staff) select. The filter lives in the URL
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
  // No results is a staff filter (finding meets still waiting on an import), offered alongside Trash.
  const showNoResults = showTrash
  const activeScope =
    (scope === "mine" && showScope) || (scope === "no-results" && showNoResults) ? scope : "all"

  return (
    <>
      {(showScope || showTrash) && (
        <ToolbarSelect
          label="Show meets"
          icon={
            inTrash ? "trash" : activeScope === "mine" ? "user" : activeScope === "no-results" ? "fileText" : "roster"
          }
          current={
            inTrash
              ? "Trash"
              : activeScope === "mine"
                ? "My meets"
                : activeScope === "no-results"
                  ? "No results"
                  : "All meets"
          }
          active={inTrash || activeScope !== "all"}
          value={inTrash ? TRASH : activeScope}
          onChange={(v) =>
            v === TRASH
              ? setFilters({ view: "deleted", scope: null })
              : setFilters({ view: null, scope: v === "mine" || v === "no-results" ? v : null })
          }
        >
          <option value="all">All meets</option>
          {showScope && <option value="mine">My meets</option>}
          {showNoResults && <option value="no-results">No results</option>}
          {showTrash && <option value={TRASH}>Trash</option>}
        </ToolbarSelect>
      )}
      <ListLayoutToggle />
      {!inTrash && children}
    </>
  )
}
