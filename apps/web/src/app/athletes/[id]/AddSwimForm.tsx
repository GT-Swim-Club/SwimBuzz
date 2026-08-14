"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import DontReloadNotice from "@/components/DontReloadNotice"
import Modal, { ModalFooter } from "@/components/Modal"
import { DatePicker } from "@/components/CustomDateTimePicker"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { parseTime, formatRelativeTime, formatDateTime } from "@/lib/utils"
import SetSwimCloudIdForm from "@/components/SetSwimCloudIdForm"

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
  const { requireScraper } = useScraperUi()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrapeStatus, setScrapeStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [scrapeError, setScrapeError] = useState<string | null>(null)
  const [scrapeCount, setScrapeCount] = useState(0)
  const [resultOpen, setResultOpen] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(timesSyncedAt)
  const [form, setForm] = useState({
    event: "50 Free",
    time: "",
    course: "SCY",
    date: new Date().toLocaleDateString('en-CA'),
    meet: "",
  })

  useDontReloadWhileBusy(scrapeStatus === "loading")

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
    requireScraper(() => {
      void (async () => {
        setScrapeStatus("loading")
        setScrapeError(null)
        setResultOpen(false)

        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ athleteId, swimmerCloudId: swimCloudId }),
        })
        const data = await res.json().catch(() => ({}))

        if (res.ok) {
          setScrapeCount(typeof data.imported === "number" ? data.imported : 0)
          setScrapeStatus("done")
          if (data.timesSyncedAt) setLastSynced(data.timesSyncedAt)
          setResultOpen(true)
          router.refresh()
        } else {
          setScrapeError(data.error ?? "Import failed — is the scraper running?")
          setScrapeStatus("error")
          setResultOpen(true)
        }
      })()
    })
  }

  function closeResultModal() {
    setResultOpen(false)
  }

  return (
    <div className="space-y-6">
      {/* SwimCloud import */}
      <section>
        <h2 className="text-sm font-medium text-foreground-secondary text-foreground-secondary uppercase tracking-wide mb-3">
          Import from SwimCloud
        </h2>
        {swimCloudId ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleScrape}
                disabled={scrapeStatus === "loading"}
                className="text-sm px-4 py-2 border border-border-secondary rounded-lg hover:bg-fill-secondary dark:hover:bg-fill-secondary dark:bg-background-elevated disabled:opacity-40 transition-colors"
              >
                {scrapeStatus === "loading" ? "Importing..." : "Import times"}
              </button>
              {scrapeStatus !== "loading" && (
                <span className="text-xs text-gray-400 dark:text-zinc-500" title={lastSynced ? formatDateTime(lastSynced) : undefined}>
                  {lastSynced ? `Last imported ${formatRelativeTime(lastSynced)}` : "Never imported"}
                </span>
              )}
            </div>
            {scrapeStatus === "loading" && (
              <p className="text-xs text-foreground-secondary text-foreground-secondary">
                Scraping SwimCloud events — typically 1–2 minutes…
              </p>
            )}
            {scrapeStatus === "loading" && <DontReloadNotice />}
          </div>
        ) : (
          <div className="border border-border-secondary rounded-xl p-4 bg-background dark:bg-background-elevated space-y-3">
            <p className="text-sm text-foreground-secondary dark:text-foreground-secondary">
              Link this athlete to SwimCloud to import their times.
            </p>
            <SetSwimCloudIdForm athleteId={athleteId} />
          </div>
        )}
      </section>

      <Modal
        open={resultOpen && (scrapeStatus === "done" || scrapeStatus === "error")}
        onClose={closeResultModal}
        title={scrapeStatus === "error" ? "Import failed" : "Import complete"}
        description={
          scrapeStatus === "error"
            ? scrapeError ?? "Something went wrong while importing times."
            : scrapeCount === 1
              ? "1 new swim was imported from SwimCloud."
              : `${scrapeCount} new swims were imported from SwimCloud.`
        }
        maxWidth="sm"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeResultModal}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover"
            >
              Done
            </button>
          </ModalFooter>
        }
      />

      {/* Manual entry */}
      <section>
        <h2 className="text-sm font-medium text-foreground-secondary text-foreground-secondary uppercase tracking-wide mb-3">
          Log a swim manually
        </h2>
        <div className="border border-border-secondary rounded-xl p-4 bg-background">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-[110px]">
              <label className="text-xs text-foreground-secondary mb-1 block">Event</label>
              <select
                className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background"
                value={form.event}
                onChange={e => setForm(f => ({ ...f, event: e.target.value }))}
              >
                {EVENTS.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div className="w-[80px]">
              <label className="text-xs text-foreground-secondary mb-1 block">Course</label>
              <select
                className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background"
                value={form.course}
                onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
              >
                <option>SCY</option>
                <option>LCM</option>
                <option>SCM</option>
              </select>
            </div>
            <div className="w-[120px]">
              <label className="text-xs text-foreground-secondary mb-1 block">Time</label>
              <input
                type="text"
                placeholder=""
                className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm font-mono bg-background"
                value={form.time}
                onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              />
            </div>
            <div className="flex-1 min-w-[250px]">
              <label className="text-xs text-foreground-secondary mb-1 block">Meet</label>
              <input
                type="text"
                className="w-full border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background"
                value={form.meet}
                onChange={e => setForm(f => ({ ...f, meet: e.target.value }))}
              />
            </div>
            <div className="w-[140px]">
              <label className="text-xs text-foreground-secondary mb-1 block">Date</label>
              <DatePicker
                value={form.date}
                onChange={(value) => setForm((form) => ({ ...form, date: value }))}
                ariaLabel="Date"
                clearable
              />
            </div>
          </div>
          {error && (
            <p className="text-sm text-error mt-3">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading || !form.time}
            className="w-full mt-4 py-2 text-sm border border-border-secondary rounded-lg hover:bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
          >
            {loading ? "Saving..." : "Log swim"}
          </button>
        </div>
      </section>
    </div>
  )
}
