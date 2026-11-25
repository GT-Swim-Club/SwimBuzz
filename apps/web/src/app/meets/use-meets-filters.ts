"use client"

import { useSearchParams } from "next/navigation"

/** "no-results": past meets whose results haven't been imported yet (staff only). */
export type MeetsScope = "all" | "mine" | "no-results"

/**
 * Scope (All / My meets / No results) / Trash filters for /meets, read from the URL. Writes go through
 * `history.replaceState`, which Next.js syncs into `useSearchParams` without a
 * server round trip — both filters are applied client-side
 * (Trash fetches its own data), so changing a dropdown is instant.
 */
function parseScope(value: string | null): MeetsScope {
  return value === "mine" || value === "no-results" ? value : "all"
}

export function useMeetsFilters() {
  const searchParams = useSearchParams()

  function setFilters(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }

  return {
    query: searchParams.get("q")?.trim() ?? "",
    scope: parseScope(searchParams.get("scope")),
    inTrash: searchParams.get("view") === "deleted",
    setFilters,
  }
}
