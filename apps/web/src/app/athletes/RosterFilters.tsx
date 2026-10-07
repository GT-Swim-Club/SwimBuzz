"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { resolveListedSeason } from "@/lib/season"

function useRosterParams(seasons: string[]) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") ?? "all"
  const season = resolveListedSeason(
    searchParams.get("season") ?? searchParams.get("year"),
    seasons
  )

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

export default function RosterFilters({ seasons }: { seasons: string[] }) {
  const { gender, season, updateParams } = useRosterParams(seasons)

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
        {seasons.map((s) => (
          <option key={s} value={s}>
            {formatSeasonLabel(s)}
          </option>
        ))}
      </select>
    </div>
  )
}
