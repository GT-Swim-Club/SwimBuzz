"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const EVENTS = [
  "50 Free", "100 Free", "200 Free", "400 Free", "500 Free",
  "1000 Free", "1650 Free", "100 Back", "200 Back",
  "100 Breast", "200 Breast", "100 Fly", "200 Fly",
  "200 IM", "400 IM",
]

export default function AddSwimForm({ athleteId, swimCloudId }: { 
  athleteId: string
  swimCloudId: number | null 
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [scrapeStatus, setScrapeStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [scrapeCount, setScrapeCount] = useState(0)
  const [form, setForm] = useState({
    event: "50 Free",
    time: "",
    course: "SCY",
    date: new Date().toISOString().split("T")[0],
    meet: "",
  })

  async function handleSubmit() {
    if (!form.time) return
    setLoading(true)

    const parts = form.time.split(":")
    const ms = parts.length === 2
      ? (parseInt(parts[0]) * 60 + parseFloat(parts[1])) * 1000
      : parseFloat(parts[0]) * 1000

    await fetch("/api/swims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, athleteId, timeMs: ms }),
    })

    setLoading(false)
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
          </div>
        ) : (
          <p className="text-xs text-gray-400">No SwimCloud ID set for this athlete.</p>
        )}
      </section>

      {/* Manual entry */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
          Log a swim manually
        </h2>
        <div className="border rounded-xl p-4 space-y-3 bg-white dark:bg-zinc-900">
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Date</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Meet</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.meet}
                onChange={e => setForm(f => ({ ...f, meet: e.target.value }))}
              />
            </div>
          </div>
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