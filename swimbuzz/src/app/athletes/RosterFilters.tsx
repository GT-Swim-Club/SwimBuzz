"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import LiveSearch from "@/components/LiveSearch"
import { currentSeason, parseSeason } from "@/lib/season"

function useRosterParams() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") ?? "all"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("year")
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key)
      else params.set(key, value)
    }
    router.push(`/athletes?${params.toString()}`)
  }

  return { gender, season, updateParams }
}

export function RosterSearch() {
  return <LiveSearch pathname="/athletes" placeholder="Search athletes…" />
}

export default function RosterFilters({ count }: { count: number }) {
  const { gender, season, updateParams } = useRosterParams()
  const [fetchedSeasons, setFetchedSeasons] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/seasons")
        .then(res => res.ok ? res.json() : [])
        .then(setFetchedSeasons)
        .catch(() => setFetchedSeasons([]))
  }, [])

  return (
    <div className="flex items-center gap-2">
      <select
        value={gender === "F" || gender === "M" || gender === "all" ? gender : "all"}
        onChange={(e) => updateParams({ gender: e.target.value })}
        className="text-sm border border-border-secondary rounded-lg px-3 py-1.5 bg-background"
      >
        <option value="all">All</option>
        <option value="M">Men</option>
        <option value="F">Women</option>
      </select>
      <select
        value={season}
        onChange={(e) => updateParams({ season: e.target.value })}
        className="text-sm border border-border-secondary rounded-lg px-3 py-1.5 bg-background"
      >
        {fetchedSeasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span className="text-xs text-foreground-secondary">
        {count} athlete{count === 1 ? "" : "s"}
      </span>
    </div>
  )
}
