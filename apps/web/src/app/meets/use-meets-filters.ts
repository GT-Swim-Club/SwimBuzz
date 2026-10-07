"use client"

import { useSearchParams } from "next/navigation"
import { parseSeason } from "@/lib/season"

export type MeetsScope = "all" | "mine"

/**
 * Season / scope / Trash filters for /meets, read from the URL. Writes go
 * through `history.replaceState`, which Next.js syncs into `useSearchParams`
 * without a server round trip — all three filters are applied client-side
 * (Trash fetches its own data), so changing a dropdown is instant.
 */
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
    season: parseSeason(searchParams.get("season")),
    scope: (searchParams.get("scope") === "mine" ? "mine" : "all") as MeetsScope,
    inTrash: searchParams.get("view") === "deleted",
    setFilters,
  }
}
