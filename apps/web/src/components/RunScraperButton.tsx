"use client"

import HoverDetail from "@/components/HoverDetail"
import { useScraperUi } from "@/components/ScraperUiProvider"

function ScraperIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 8h.01M7 12h.01M7 16h.01" />
      <path d="M11 8h6M11 12h6M11 16h4" />
    </svg>
  )
}

export default function RunScraperButton({ compact = false }: { compact?: boolean }) {
  const { connected, loading, openRunScraper } = useScraperUi()
  const statusClass = loading
    ? "bg-gray-300"
    : connected
      ? "bg-emerald-500 motion-safe:animate-pulse"
      : "bg-amber-500"

  return (
    <button
      type="button"
      onClick={openRunScraper}
      aria-label={compact ? "Run Scraper" : undefined}
      className={
        "group relative inline-flex h-9 items-center justify-center rounded-lg border transition-colors " +
        (compact ? "w-9" : "gap-2 px-3 text-xs") +
        (connected
          ? " border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-emerald-600 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-200"
          : " border-border-secondary bg-background text-foreground hover:border-border hover:bg-fill-secondary dark:bg-background dark:hover:border-border dark:hover:bg-fill")
      }
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <ScraperIcon className="h-4 w-4" />
        <span className={`absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full ring-2 ring-background ${statusClass}`} aria-hidden="true" />
      </span>
      {compact ? <HoverDetail label="Run Scraper" /> : null}
      {!compact ? <span>Run Scraper</span> : null}
    </button>
  )
}
