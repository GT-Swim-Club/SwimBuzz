"use client"

import { useCallback, useEffect, useState } from "react"

type ScraperStatus = {
  connected: boolean
  lastSeenAt: string | null
}

/**
 * The desktop scraper's connection, polled every `pollMs` while the tab is visible. Off (no
 * requests) when `enabled` is false — the status route is staff-only.
 */
export function useScraperStatus(pollMs = 4000, enabled = true) {
  const [status, setStatus] = useState<ScraperStatus>({ connected: false, lastSeenAt: null })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/status")
      const data = await res.json()
      if (res.ok) {
        const next = {
          connected: !!data.connected,
          lastSeenAt: (data.lastSeenAt as string | null) ?? null,
        }
        setStatus(next)
        return next
      }
    } catch {
      // fall through
    }
    const next = { connected: false, lastSeenAt: null }
    setStatus(next)
    return next
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh().finally(() => setLoading(false))
    // Each check hits the database, so skip them in a hidden tab and catch up when it's shown again.
    const tick = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const id = window.setInterval(tick, pollMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [enabled, pollMs, refresh])

  return { ...status, loading: enabled && loading, refresh }
}
