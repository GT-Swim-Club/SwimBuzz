"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { parseTime, formatRelativeTime, formatDateTime } from "@/lib/utils"
import SetSwimCloudIdForm from "./SetSwimCloudIdForm"

const EVENTS = [
  "50 Free", "100 Free", "200 Free", "400 Free", "500 Free",
  "1000 Free", "1650 Free", "100 Back", "200 Back",
  "100 Breast", "200 Breast", "100 Fly", "200 Fly",
  "200 IM", "400 IM",
]

export default function AddSwimForm({ athleteId, swimCloudId, timesSyncedAt }: { 
  athleteId: string
  swimCloudId: number | null 
  timesSyncedAt: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrapeStatus, setScrapeStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [scrapeCount, setScrapeCount] = useState(0)
  const [lastSynced, setLastSynced] = useState<string | null>(timesSyncedAt)
  const [form, setForm] = useState({
    event: "50 Free",
    time: "",
    course: "SCY",
    date: new Date().toLocaleDateString('en-CA'),
    meet: "",
  })

  async function handleSubmit() {
    if (!form.time) return
    setLoading(true)
    setError(null)

    const timeMs = Math.round(parseTime(form.time))

    if (!Number.isFinite(timeMs) || timeMs <= 0) {
      setError("Invalid time format")
      setLoading(false)
      return
    }

    const res = await fetch("/api/swims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        athleteId,
        event: form.event,
        course: form.course,
        date: form.date,
        meet: form.meet,
        timeMs,
      }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Failed to save swim")
      return
    }

    setForm(f => ({ ...f, time: "" }))
    router.refresh()
  }

  async function handleScrape() {
    if (!swimCloudId) return
    setScrapeStatus("loading")

    const res = await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ athleteId, swimmerCloudId: swimCloudId }),
    })
    const data = await res.json()

    if (res.ok) {
      setScrapeCount(data.imported)
      setScrapeStatus("done")
      if (data.timesSyncedAt) setLastSynced(data.timesSyncedAt)
      router.refresh()
    } else {
      setScrapeStatus("error")
    }
  }

  return (
    <div className="space-y-6">
      {/* SwimCloud import */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
          Import from SwimCloud
        </h2>
        {swimCloudId ? (
          <div className="flex items-center gap-3">
            <button
              onClick={handleScrape}
              disabled={scrapeStatus === "loading"}
              className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
            >
              {scrapeStatus === "loading" ? "Importing..." : "Import times"}
            </button>
            {scrapeStatus === "done" && (
              <span className="text-xs text-gray-500 dark:text-zinc-400">{scrapeCount} swims imported</span>
            )}
            {scrapeStatus === "error" && (
              <span className="text-xs text-red-500">Import failed — is the scraper running?</span>
            )}
            {scrapeStatus !== "done" && (
              <span className="text-xs text-gray-400 dark:text-zinc-500" title={lastSynced ? formatDateTime(lastSynced) : undefined}>
                {lastSynced ? `Last imported ${formatRelativeTime(lastSynced)}` : "Never imported"}
              </span>
            )}
          </div>
        ) : (
          <div className="border rounded-xl p-4 bg-white dark:bg-zinc-900 space-y-3">
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              Link this athlete to SwimCloud to import their times.
            </p>
            <SetSwimCloudIdForm athleteId={athleteId} />
          </div>
        )}
      </section>

      {/* Manual entry */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
          Log a swim manually
        </h2>
        <div className="border rounded-xl p-4 space-y-3 bg-white dark:bg-zinc-900">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Event</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.event}
                onChange={e => setForm(f => ({ ...f, event: e.target.value }))}
              >
                {EVENTS.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Course</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.course}
                onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
              >
                <option>SCY</option>
                <option>LCM</option>
                <option>SCM</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Time (m:ss.hh)</label>
              <input
                type="text"
                placeholder="1:23.45 or 58.32"
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-[1.5fr_1fr] gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Meet</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.meet}
                onChange={e => setForm(f => ({ ...f, meet: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Date</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !form.time}
            className="w-full py-2 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
          >
            {loading ? "Saving..." : "Log swim"}
          </button>
        </div>
      </section>
    </div>
  )
}