"use client"

import { useEffect, useRef, useState } from "react"
import { rosterSummaryPdfFilename, type RosterSummaryPdfRequest } from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { PdfMenuIcon, downloadBlob } from "@/components/ui/export-menu"

const MENU_ITEM =
  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"

/** Share menu for the roster summary: Download PDF of the view as it's shown. */
export default function ShareRosterSummaryButton({
  meetId,
  meetName,
  buildRequest,
  onOpen,
}: {
  meetId: string
  meetName: string
  /** The current view (mode, filters, search, row toggles) as sections of rows. */
  buildRequest: () => RosterSummaryPdfRequest
  onOpen?: () => void
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
      // Laid out server-side, like the mobile app's Share PDF.
      const request = buildRequest()
      const res = await fetch(`/api/meets/${encodeURIComponent(meetId)}/roster-summary/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })
      if (!res.ok) throw new Error("Could not export PDF")
      downloadBlob(await res.blob(), rosterSummaryPdfFilename(meetName, request))
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
          if (!open) onOpen?.()
          setOpen((value) => !value)
        }}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share roster summary"
        className="group relative inline-flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill disabled:opacity-40"
      >
        <ActionIcon kind="share" className="h-[18px] w-[18px]" />
        {!open && <HoverDetail label={busy ? "Exporting PDF…" : "Share roster summary"} />}
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
      {error && (
        <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-error">{error}</p>
      )}
    </div>
  )
}
