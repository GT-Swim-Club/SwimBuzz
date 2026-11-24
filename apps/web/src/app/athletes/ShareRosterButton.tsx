"use client"

import { useEffect, useRef, useState } from "react"
import { rosterCsvFilename, rosterPdfFilename } from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { CsvMenuIcon, PdfMenuIcon, downloadBlob } from "@/components/ui/export-menu"
import { toolbarIconButtonClass } from "@/components/ui/FluidToolbar"
import type { RosterFilters } from "@/lib/roster/roster-filters"

const MENU_ITEM =
  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"

type ExportFormat = "pdf" | "csv"

/**
 * Share menu in the roster toolbar (the same menu as the records and meet exports): Download PDF
 * or Download CSV of the roster as the page shows it (season, filters and search), built
 * server-side like the mobile app's Share PDF / Share CSV.
 */
export default function ShareRosterButton({
  season,
  filters,
  query,
}: {
  /** null = every season. */
  season: string | null
  filters: RosterFilters
  query: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  async function download(format: ExportFormat) {
    const label = format === "pdf" ? "PDF" : "CSV"
    setBusy(format)
    setError(null)
    setOpen(false)
    try {
      const params = new URLSearchParams()
      if (season) params.set("season", season)
      for (const [key, value] of Object.entries(filters)) if (value !== "all") params.set(key, value)
      if (query) params.set("q", query)
      const res = await fetch(`/api/roster/${format}?${params.toString()}`)
      if (!res.ok) throw new Error(`Could not export ${label}`)
      downloadBlob(await res.blob(), format === "pdf" ? rosterPdfFilename(season) : rosterCsvFilename(season))
    } catch {
      setError(`Could not export ${label}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (!open) setError(null)
          setOpen((value) => !value)
        }}
        disabled={busy != null}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share roster"
        className={`${toolbarIconButtonClass} disabled:opacity-40`}
      >
        <ActionIcon kind="share" className="h-4 w-4" />
        {!open && (
          <HoverDetail
            label={busy === "pdf" ? "Exporting PDF…" : busy === "csv" ? "Exporting CSV…" : "Share roster"}
          />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="export-menu-fade-in absolute right-0 top-full z-40 mt-1 w-max overflow-hidden rounded-lg border border-border bg-background-elevated py-1 shadow-md"
        >
          <button type="button" role="menuitem" onClick={() => void download("pdf")} className={MENU_ITEM}>
            <PdfMenuIcon className="h-4 w-4 shrink-0" />
            Download PDF
          </button>
          <button type="button" role="menuitem" onClick={() => void download("csv")} className={MENU_ITEM}>
            <CsvMenuIcon className="h-4 w-4 shrink-0" />
            Download CSV
          </button>
        </div>
      )}
      {error && <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-error">{error}</p>}
    </div>
  )
}
