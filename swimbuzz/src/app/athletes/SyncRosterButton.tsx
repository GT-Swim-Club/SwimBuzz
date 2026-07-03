"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"

export default function SyncRosterButton() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const gender = searchParams.get("gender") ?? "M"
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()))

  function updateParam(key: "gender" | "year", value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`/athletes?${params.toString()}`)
  }

  async function handleSync() {
    setStatus("loading")
    const res = await fetch("/api/roster/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, gender }),
    })
    const data = await res.json()
    if (res.ok) {
      setResult(data)
      setStatus("done")
      router.refresh()
    } else {
      setStatus("error")
    }
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={gender}
        onChange={e => updateParam("gender", e.target.value)}
        className="text-xs border rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900"
      >
        <option value="M">Men</option>
        <option value="F">Women</option>
      </select>
      <select
        value={year}
        onChange={e => updateParam("year", e.target.value)}
        className="text-xs border rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900"
      >
        {[2026, 2025, 2024, 2023, 2022].map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button
        onClick={handleSync}
        disabled={status === "loading"}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
      >
        <Image src="/swimcloud.webp" alt="" width={28} height={28} className="shrink-0" />
        {status === "loading" ? "Importing..." : "Import Roster"}
      </button>
      {status === "done" && result && (
        <span className="text-xs text-gray-500 dark:text-zinc-400">
          {result.created} added, {result.skipped} already existed
        </span>
      )}
      {status === "error" && (
        <span className="text-xs text-red-500">Import failed</span>
      )}
    </div>
  )
}