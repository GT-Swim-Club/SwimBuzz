"use client"

import type { ReactNode } from "react"
import DeletedMeetsList from "./DeletedMeetsList"
import { useMeetsFilters } from "./use-meets-filters"

/** Swaps the meets list for Trash client-side, so picking Trash in the season dropdown needs no server round trip. */
export default function MeetsViewSwitch({ showTrash, children }: { showTrash: boolean; children: ReactNode }) {
  const { inTrash, query } = useMeetsFilters()
  return showTrash && inTrash ? <DeletedMeetsList query={query} /> : <>{children}</>
}
