"use client"

import { useState } from "react"
import { StatusPill } from "@/components/scraper/RunScraperModal"
import { useScraperUi } from "@/components/scraper/ScraperUiProvider"
import { formatRelativeTime } from "@/lib/utils"

const buttonClass =
  "rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary disabled:opacity-50"

/** Staff-only: the desktop scraper's pairing status, with the same actions as the Run Scraper modal. */
export default function ScraperSettings() {
  const { connected, lastSeenAt, loading, refresh, openRunScraper } = useScraperUi()
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function disconnect() {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch("/api/scraper/status", { method: "DELETE" })
      if (!res.ok) throw new Error()
      await refresh()
    } catch {
      setError("Couldn’t disconnect the scraper")
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="divide-y divide-border">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Status</p>
          <p className="text-xs text-foreground-secondary">
            Required for SwimCloud and SwimPhone imports
          </p>
        </div>
        <StatusPill loading={loading} connected={connected} />
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <p className="text-sm text-foreground-secondary">Last heartbeat</p>
        <p className="truncate text-sm font-medium text-foreground">
          {connected && lastSeenAt ? formatRelativeTime(lastSeenAt) : "—"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Pairing</p>
          <p className="text-xs text-foreground-secondary">
            {connected
              ? "Paired with the scraper running on your computer"
              : "Install the scraper and pair it with a run command"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected ? (
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground-secondary transition-colors hover:text-error disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : null}
          <button type="button" onClick={openRunScraper} className={buttonClass}>
            {connected ? "Details" : "Set up"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Download installer</p>
          <p className="text-xs text-foreground-secondary">
            Run it with this site’s address — Set up has the one-line command
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href="/scraper/install.sh" download className={buttonClass}>
            Mac / Linux
          </a>
          <a href="/scraper/install.ps1" download className={buttonClass}>
            Windows
          </a>
        </div>
      </div>

      {error ? <p className="px-4 py-2 text-xs text-error">{error}</p> : null}
    </div>
  )
}
