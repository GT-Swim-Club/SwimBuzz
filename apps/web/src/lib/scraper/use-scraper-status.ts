"use client"

import { useCallback, useEffect, useState } from "react"

type ScraperStatus = {
  connected: boolean
  lastSeenAt: string | null
}

export function useScraperStatus(pollMs = 4000) {
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
    void refresh().finally(() => setLoading(false))
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(id)
  }, [pollMs, refresh])

  return { ...status, loading, refresh }
}
