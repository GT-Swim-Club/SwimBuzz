"use client"

import { useScraperUi } from "@/components/ScraperUiProvider"

export default function RunScraperButton() {
  const { connected, loading, openRunScraper } = useScraperUi()

  return (
    <button
      type="button"
      onClick={openRunScraper}
      className={`inline-flex w-full items-center justify-center gap-1.5 text-xs px-3 py-2 border rounded-lg transition-colors md:w-auto md:py-1.5 ${
        connected
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:border-emerald-600 dark:hover:bg-emerald-900/50 dark:hover:text-emerald-200"
          : "border-border-secondary bg-background text-foreground hover:border-border hover:bg-fill-secondary dark:bg-background dark:hover:border-border dark:hover:bg-fill"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          loading ? "bg-gray-300" : connected ? "bg-emerald-500 motion-safe:animate-pulse" : "bg-amber-500"
        }`}
        aria-hidden="true"
      />
      Scraper
    </button>
  )
}
