"use client"

import { useEffect, useRef, useState } from "react"
import { toPng } from "html-to-image"
import {
  rosterSummaryPdfFilename,
  rosterSummaryText,
  type MeetHeaderDetails,
  type RosterSummaryPdfRequest,
} from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import {
  CheckIcon,
  CopyTextMenuIcon,
  PdfMenuIcon,
  PngMenuIcon,
  downloadBlob,
} from "@/components/ui/export-menu"
import RosterSummaryExportCapture from "./RosterSummaryExportCapture"

/** Transparent 1×1 GIF, used if the meet icon can't be inlined into the image. */
const IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

const MENU_ITEM =
  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"

/** Share menu for the roster summary: Copy as text, Download PNG, Download PDF of the view as it's shown. */
export default function ShareRosterSummaryButton({
  meetId,
  meetName,
  details,
  iconUrl,
  buildRequest,
  onOpen,
}: {
  meetId: string
  meetName: string
  /** Date and location for the PNG's header. */
  details: MeetHeaderDetails
  iconUrl: string | null
  /** The current view (session, mode, filters, search, row toggles) as sections of rows. */
  buildRequest: () => RosterSummaryPdfRequest
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The view as of opening the menu, rendered off-screen for the PNG while the menu is open.
  const [request, setRequest] = useState<RosterSummaryPdfRequest | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const captureRef = useRef<HTMLDivElement>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    }
  }, [])

  async function capturePngBlob(): Promise<Blob> {
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
    return (await fetch(dataUrl)).blob()
  }

  async function downloadPng() {
    if (!request) return
    setBusy("png")
    setError(null)
    setOpen(false)
    try {
      downloadBlob(await capturePngBlob(), rosterSummaryPdfFilename(meetName, request, "png"))
    } catch {
      setError("Could not export image")
    } finally {
      setBusy(null)
    }
  }

  async function copyText() {
    setError(null)
    try {
      const textRequest = request ?? buildRequest()
      await navigator.clipboard.writeText(rosterSummaryText({ meetName, details, request: textRequest }))
      setCopied(true)
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Could not copy text")
    }
  }

  async function downloadPdf() {
    setBusy("pdf")
    setError(null)
    setOpen(false)
    try {
      // Laid out server-side, like the mobile app's Share PDF.
      const pdfRequest = request ?? buildRequest()
      const res = await fetch(`/api/meets/${encodeURIComponent(meetId)}/roster-summary/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdfRequest),
      })
      if (!res.ok) throw new Error("Could not export PDF")
      downloadBlob(await res.blob(), rosterSummaryPdfFilename(meetName, pdfRequest))
    } catch {
      setError("Could not export PDF")
    } finally {
      setBusy(null)
    }
  }

  const label =
    busy === "png"
      ? "Exporting image…"
      : busy === "pdf"
        ? "Exporting PDF…"
        : "Share roster summary"

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (!open) {
            onOpen?.()
            setRequest(buildRequest())
            setError(null)
          }
          setOpen((value) => !value)
        }}
        disabled={Boolean(busy)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share roster summary"
        className="group relative inline-flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill disabled:opacity-40"
      >
        <ActionIcon kind="share" className="h-[18px] w-[18px]" />
        {!open && <HoverDetail label={label} />}
      </button>
      {open && (
        <div
          role="menu"
          className="export-menu-fade-in absolute right-0 top-full z-40 mt-1 w-max overflow-hidden rounded-lg border border-border bg-background-elevated py-1 shadow-md"
        >
          <button type="button" role="menuitem" onClick={() => void copyText()} className={MENU_ITEM}>
            {copied ? <CheckIcon className="h-4 w-4 shrink-0" /> : <CopyTextMenuIcon className="h-4 w-4 shrink-0" />}
            {copied ? "Copied" : "Copy as text"}
          </button>
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
      {error && (
        <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-error">{error}</p>
      )}
      {/* Mounted while the menu is open (and through an export) so Download PNG can capture at once. */}
      {(open || busy === "png") && request ? (
        <div aria-hidden className="pointer-events-none absolute left-[-10000px] top-0">
          <div ref={captureRef} className="w-fit">
            <RosterSummaryExportCapture meetName={meetName} details={details} iconUrl={iconUrl} request={request} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
