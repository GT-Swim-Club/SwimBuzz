"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { resolveListedSeason } from "@/lib/season"

export default function QualifierFilters({
              seasons
}: {
  seasons: string[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const gender = searchParams.get("gender") ?? "all"
  const season = resolveListedSeason(searchParams.get("season"), seasons)

  function update(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key)
      else params.set(key, value)
    }
    router.push(`/qualifiers?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={gender === "F" || gender === "M" || gender === "all" ? gender : "all"}
        onChange={(e) => update({ gender: e.target.value })}
        className="text-sm border border-border-secondary rounded-lg px-3 py-1.5 bg-background"
      >
        <option value="all">All</option>
        <option value="M">Men</option>
        <option value="F">Women</option>
      </select>
      <select
        value={season}
        onChange={(e) => update({ season: e.target.value })}
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
