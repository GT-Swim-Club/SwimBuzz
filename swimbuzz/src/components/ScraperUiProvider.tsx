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
import Modal, { ModalFooter } from "@/components/Modal"
import RunScraperModal from "@/components/RunScraperModal"
import { useBridgeStatus } from "@/lib/use-bridge-status"

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

function NeedScraperModal({
  open,
  onClose,
  onOpenRunScraper,
}: {
  open: boolean
  onClose: () => void
  onOpenRunScraper: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scraper required"
      description={
        <span className="mt-1 block text-base text-amber-700 dark:text-amber-400">
          Imports from SwimCloud, SwimPhone, and meet PDFs require you to run the scraper on your
          computer. Run the scraper, then try the import again.
        </span>
      }
      maxWidth="sm"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onOpenRunScraper}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Run scraper
          </button>
        </ModalFooter>
      }
    />
  )
}

export default function ScraperUiProvider({ children }: { children: ReactNode }) {
  const { connected, loading, refresh } = useBridgeStatus()
  const [runOpen, setRunOpen] = useState(false)
  const [needOpen, setNeedOpen] = useState(false)
  const pendingRef = useRef<(() => void) | null>(null)
  const wasRunOpen = useRef(false)

  const openRunScraper = useCallback(() => {
    setNeedOpen(false)
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
        setNeedOpen(true)
      })()
    },
    [connected, loading, refresh]
  )

  useEffect(() => {
    if (wasRunOpen.current && !runOpen && connected && pendingRef.current) {
      const proceed = pendingRef.current
      pendingRef.current = null
      proceed()
    }
    wasRunOpen.current = runOpen
  }, [runOpen, connected])

  return (
    <ScraperUiContext.Provider
      value={{ connected, loading, refresh, openRunScraper, requireScraper }}
    >
      {children}
      <NeedScraperModal
        open={needOpen}
        onClose={() => {
          pendingRef.current = null
          setNeedOpen(false)
        }}
        onOpenRunScraper={openRunScraper}
      />
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
