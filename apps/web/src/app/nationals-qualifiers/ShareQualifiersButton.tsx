"use client"

import { useEffect, useRef, useState } from "react"
import { nationalsQualifiersPdfFilename } from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { PdfMenuIcon, downloadBlob } from "@/components/ui/export-menu"
import { toolbarIconButtonClass } from "@/components/ui/FluidToolbar"

const MENU_ITEM =
  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"

/**
 * Share menu in the Nationals toolbar (the same menu as the roster, records and meet exports):
 * Download PDF of the qualifiers as the page shows them (season, gender, grouping and search),
 * under the Nationals meet's order of events, laid out server-side like the mobile app's Share PDF.
 */
export default function ShareQualifiersButton({
  season,
  gender,
  byEvent,
  query,
}: {
  season: string
  gender: "all" | "M" | "F"
  byEvent: boolean
  query: string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
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

  async function downloadPdf() {
    setBusy(true)
    setError(null)
    setOpen(false)
    try {
      const params = new URLSearchParams({ season })
      if (gender !== "all") params.set("gender", gender)
      if (byEvent) params.set("group", "event")
      if (query) params.set("q", query)
      const res = await fetch(`/api/qualifiers/pdf?${params.toString()}`)
      if (!res.ok) throw new Error("Could not export PDF")
      downloadBlob(await res.blob(), nationalsQualifiersPdfFilename(season))
    } catch {
      setError("Could not export PDF")
    } finally {
      setBusy(false)
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
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share qualifiers"
        className={`${toolbarIconButtonClass} disabled:opacity-40`}
      >
        <ActionIcon kind="share" className="h-4 w-4" />
        {!open && <HoverDetail label={busy ? "Exporting PDF…" : "Share qualifiers"} />}
      </button>
      {open && (
        <div
          role="menu"
          className="export-menu-fade-in absolute right-0 top-full z-40 mt-1 w-max overflow-hidden rounded-lg border border-border bg-background-elevated py-1 shadow-md"
        >
          <button type="button" role="menuitem" onClick={() => void downloadPdf()} className={MENU_ITEM}>
            <PdfMenuIcon className="h-4 w-4 shrink-0" />
            Download PDF
          </button>
        </div>
      )}
      {error && <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-error">{error}</p>}
    </div>
  )
}
