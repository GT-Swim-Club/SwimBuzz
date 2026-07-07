"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason, seasonOptions } from "@/lib/season"

export default function RosterFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const gender = searchParams.get("gender") ?? "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  function updateParam(key: "gender" | "season", value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("year")
    params.set(key, value)
    router.push(`/athletes?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={gender}
        onChange={(e) => updateParam("gender", e.target.value)}
        className="text-xs border rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900"
      >
        <option value="M">Men</option>
        <option value="F">Women</option>
      </select>
      <select
        value={season}
        onChange={(e) => updateParam("season", e.target.value)}
        className="text-xs border rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900"
      >
        {seasonOptions().map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  )
}
