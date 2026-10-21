"use client"

import {
  createContext,
  useCallback,
  useContext,
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
  /**
   * Run `proceed` once the scraper is connected. If it isn't, the Run Scraper modal opens and its
   * primary button becomes `continueLabel` (e.g. "Continue to import"), which runs `proceed`.
   */
  requireScraper: (proceed: () => void, options?: { continueLabel?: string }) => void
}

type PendingAction = { proceed: () => void; label: string }

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
  const [pending, setPending] = useState<PendingAction | null>(null)

  const openRunScraper = useCallback(() => {
    setPending(null)
    setRunOpen(true)
  }, [])

  const requireScraper = useCallback(
    (proceed: () => void, options?: { continueLabel?: string }) => {
      void (async () => {
        const status = loading ? await refresh() : { connected }
        if (status.connected) {
          setPending(null)
          proceed()
          return
        }
        setPending({ proceed, label: options?.continueLabel ?? "Continue" })
        setRunOpen(true)
      })()
    },
    [connected, loading, refresh]
  )

  function closeRunScraper() {
    setRunOpen(false)
    setPending(null)
  }

  function continuePending() {
    const action = pending
    closeRunScraper()
    action?.proceed()
  }

  return (
    <ScraperUiContext.Provider
      value={{ connected, loading, refresh, openRunScraper, requireScraper }}
    >
      {children}
      <RunScraperModal
        open={runOpen}
        onClose={closeRunScraper}
        continueLabel={pending?.label ?? null}
        onContinue={continuePending}
        connected={connected}
        loading={loading}
        refresh={refresh}
      />
    </ScraperUiContext.Provider>
  )
}
