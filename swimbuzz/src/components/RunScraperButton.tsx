"use client"

import { useScraperUi } from "@/components/ScraperUiProvider"

export default function RunScraperButton() {
  const { connected, loading, openRunScraper } = useScraperUi()

  return (
    <button
      type="button"
      onClick={openRunScraper}
      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg transition-colors ${
        connected
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          loading ? "bg-gray-300" : connected ? "bg-emerald-500" : "bg-amber-500"
        }`}
        aria-hidden="true"
      />
      Run Scraper
    </button>
  )
}
