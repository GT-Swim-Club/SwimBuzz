"use client"

import { useEffect, useRef, useState } from "react"
import { toPng } from "html-to-image"
import { recordsAsOfLabel, recordsExportFilename, type TeamRecordRow } from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { PdfMenuIcon, PngMenuIcon, downloadBlob } from "@/components/ui/export-menu"
import RecordsExportCapture from "./RecordsExportCapture"

/** Transparent 1×1 GIF, used if the logo can't be inlined into the image. */
const IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

const MENU_ITEM =
  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"

/** Share menu for the records sheet: Download PNG and Download PDF, both genders whichever is shown. */
export default function ShareRecordsButton({ rows }: { rows: TeamRecordRow[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The date as of opening the menu, so the image is laid out once while it's open.
  const [asOf, setAsOf] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  async function downloadPng() {
    setBusy("png")
    setError(null)
    setOpen(false)
    try {
      const node = captureRef.current
      if (!node) throw new Error("Nothing to capture")
      await document.fonts.ready
      const dataUrl = await toPng(node, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || undefined,
        imagePlaceholder: IMAGE_PLACEHOLDER,
        width: node.scrollWidth,
        height: node.scrollHeight,
      })
      downloadBlob(await (await fetch(dataUrl)).blob(), recordsExportFilename("png"))
    } catch {
      setError("Could not export image")
    } finally {
      setBusy(null)
    }
  }

  async function downloadPdf() {
    setBusy("pdf")
    setError(null)
    setOpen(false)
    try {
      // Laid out server-side, like the mobile app's Share PDF.
      const res = await fetch("/api/records/pdf")
      if (!res.ok) throw new Error("Could not export PDF")
      downloadBlob(await res.blob(), recordsExportFilename("pdf"))
    } catch {
      setError("Could not export PDF")
    } finally {
      setBusy(null)
    }
  }

  const label = busy === "png" ? "Exporting image…" : busy === "pdf" ? "Exporting PDF…" : "Share records"

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (!open) {
            setAsOf(recordsAsOfLabel())
            setError(null)
          }
          setOpen((value) => !value)
        }}
        disabled={Boolean(busy)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share records"
        className="group relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill-secondary hover:text-primary disabled:opacity-40"
      >
        <ActionIcon kind="share" className="h-4 w-4" />
        {!open && <HoverDetail label={label} />}
      </button>
      {open && (
        <div
          role="menu"
          className="export-menu-fade-in absolute right-0 top-full z-40 mt-1 w-max overflow-hidden rounded-lg border border-border bg-background-elevated py-1 shadow-md"
        >
          <button type="button" role="menuitem" onClick={() => void downloadPng()} className={MENU_ITEM}>
            <PngMenuIcon className="h-4 w-4 shrink-0" />
            Download PNG
          </button>
          <button type="button" role="menuitem" onClick={() => void downloadPdf()} className={MENU_ITEM}>
            <PdfMenuIcon className="h-4 w-4 shrink-0" />
            Download PDF
          </button>
        </div>
      )}
      {error && <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-error">{error}</p>}
      {/* Mounted while the menu is open (and through an export) so Download PNG can capture at once. */}
      {open || busy === "png" ? (
        <div aria-hidden className="pointer-events-none absolute left-[-10000px] top-0">
          <div ref={captureRef} className="w-fit">
            <RecordsExportCapture rows={rows} asOf={asOf} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
