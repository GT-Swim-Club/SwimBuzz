"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import DontReloadNotice from "@/components/DontReloadNotice"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { currentSeason, parseSeason, seasonEndYear } from "@/lib/season"

export default function SyncRosterButton() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null)

  const gender = searchParams.get("gender") ?? "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  useDontReloadWhileBusy(status === "loading")

  async function handleSync() {
    setStatus("loading")
    const res = await fetch("/api/roster/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season, year: seasonEndYear(season), gender }),
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
    <div className="space-y-1">
      <div className="flex items-center gap-3">
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
      {status === "loading" && <DontReloadNotice />}
    </div>
  )
}
