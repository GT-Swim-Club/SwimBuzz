"use client"

import { useCallback, useEffect, useState } from "react"

type BridgeStatus = {
  connected: boolean
  lastSeenAt: string | null
}

export function useBridgeStatus(pollMs = 4000) {
  const [status, setStatus] = useState<BridgeStatus>({ connected: false, lastSeenAt: null })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/bridge/status")
      const data = await res.json()
      if (res.ok) {
        setStatus({
          connected: !!data.connected,
          lastSeenAt: data.lastSeenAt ?? null,
        })
      }
    } catch {
      setStatus({ connected: false, lastSeenAt: null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(id)
  }, [pollMs, refresh])

  return { ...status, loading, refresh }
}
