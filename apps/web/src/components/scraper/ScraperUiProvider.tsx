"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import RunScraperModal from "@/components/scraper/RunScraperModal"
import { useScraperStatus } from "@/lib/scraper/use-scraper-status"

type ScraperUiContextValue = {
  connected: boolean
  loading: boolean
  refresh: () => Promise<{ connected: boolean; lastSeenAt: string | null }>
  openRunScraper: () => void
  requireScraper: (proceed: () => void) => void
}

const ScraperUiContext = createContext<ScraperUiContextValue | null>(null)

export function useScraperUi() {
  const ctx = useContext(ScraperUiContext)
  if (!ctx) {
    throw new Error("useScraperUi must be used within ScraperUiProvider")
  }
  return ctx
}

export default function ScraperUiProvider({ children }: { children: ReactNode }) {
  const { connected, loading, refresh } = useScraperStatus()
  const [runOpen, setRunOpen] = useState(false)
  const pendingRef = useRef<(() => void) | null>(null)
  const wasRunOpen = useRef(false)

  const openRunScraper = useCallback(() => {
    setRunOpen(true)
  }, [])

  const requireScraper = useCallback(
    (proceed: () => void) => {
      void (async () => {
        const status = loading ? await refresh() : { connected }
        if (status.connected) {
          pendingRef.current = null
          proceed()
          return
        }
        pendingRef.current = proceed
        setRunOpen(true)
      })()
    },
    [connected, loading, refresh]
  )

  useEffect(() => {
    if (wasRunOpen.current && !runOpen && pendingRef.current) {
      const proceed = pendingRef.current
      pendingRef.current = null
      if (connected) proceed()
    }
    wasRunOpen.current = runOpen
  }, [runOpen, connected])

  return (
    <ScraperUiContext.Provider
      value={{ connected, loading, refresh, openRunScraper, requireScraper }}
    >
      {children}
      <RunScraperModal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        connected={connected}
        loading={loading}
        refresh={refresh}
      />
    </ScraperUiContext.Provider>
  )
}
