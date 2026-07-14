"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason, seasonOptions } from "@/lib/season"

export default function QualifierFilters({
  qualifierCount,
}: {
  qualifierCount: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const gender = searchParams.get("gender") ?? "all"
  const season =
    parseSeason(searchParams.get("season")) ?? currentSeason()

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
        className="text-xs border rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 dark:border-zinc-700"
      >
        <option value="all">All</option>
        <option value="M">Men</option>
        <option value="F">Women</option>
      </select>
      <select
        value={season}
        onChange={(e) => update({ season: e.target.value })}
        className="text-xs border rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 dark:border-zinc-700"
      >
        {seasonOptions().map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span className="text-xs text-gray-500 dark:text-zinc-400">
        {qualifierCount} qualifier{qualifierCount === 1 ? "" : "s"}
      </span>
    </div>
  )
}
