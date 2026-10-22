"use client"

import { useEffect, useRef, useState } from "react"
import { toPng } from "html-to-image"
import { relayShareFilename, relaySummaryCsv, type RelayShareEvent } from "@swimbuzz/shared"
import ActionIcon from "@/components/ui/ActionIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import {
  CheckIcon,
  CopyPngMenuIcon,
  CsvMenuIcon,
  PngMenuIcon,
  downloadBlob,
} from "@/components/ui/export-menu"
import RelaysExportCapture from "./RelaysExportCapture"

/** Transparent 1×1 GIF, used if the meet icon can't be inlined into the image. */
const IMAGE_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

const MENU_ITEM =
  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"

/** Share menu for the published relays: Copy PNG, Download PNG, Download CSV. */
export default function ShareRelaysButton({
  meetName,
  iconUrl,
  events,
}: {
  meetName: string
  iconUrl: string | null
  /** Published relays only, in display order. */
  events: RelayShareEvent[]
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"png" | "copy-png" | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    setBusy("png")
    setError(null)
    setOpen(false)
    try {
      downloadBlob(await capturePngBlob(), relayShareFilename(meetName, "png"))
    } catch {
      setError("Could not export image")
    } finally {
      setBusy(null)
    }
  }

  async function copyPng() {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      setError("Copying images isn't supported in this browser")
      return
    }
    setBusy("copy-png")
    setError(null)
    try {
      // Pass the blob promise directly (instead of awaiting first) so Safari still
      // treats this as triggered by the click's user gesture.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": capturePngBlob() })])
      setCopied(true)
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setError("Could not copy image")
    } finally {
      setBusy(null)
    }
  }

  function downloadCsv() {
    setError(null)
    setOpen(false)
    // Byte-order mark so Excel opens accented names as UTF-8.
    const blob = new Blob(["\uFEFF", relaySummaryCsv(events)], { type: "text/csv;charset=utf-8" })
    downloadBlob(blob, relayShareFilename(meetName, "csv"))
  }

  const label =
    busy === "png" ? "Exporting image…" : busy === "copy-png" ? "Copying image…" : "Share relays"

  return (
    <div ref={rootRef} className="relative flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={Boolean(busy)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Share relays"
        className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-fill disabled:opacity-40"
      >
        <ActionIcon kind="share" className="h-5 w-5" />
        {!open && <HoverDetail label={label} />}
      </button>
      {open && (
        <div
          role="menu"
          className="export-menu-fade-in absolute right-0 top-full z-40 mt-1 w-max overflow-hidden rounded-lg border border-border bg-background-elevated py-1 shadow-md"
        >
          <button type="button" role="menuitem" onClick={() => void copyPng()} className={MENU_ITEM}>
            {copied ? <CheckIcon className="h-4 w-4 shrink-0" /> : <CopyPngMenuIcon className="h-4 w-4 shrink-0" />}
            {copied ? "Copied" : "Copy PNG"}
          </button>
          <button type="button" role="menuitem" onClick={() => void downloadPng()} className={MENU_ITEM}>
            <PngMenuIcon className="h-4 w-4 shrink-0" />
            Download PNG
          </button>
          <button type="button" role="menuitem" onClick={downloadCsv} className={MENU_ITEM}>
            <CsvMenuIcon className="h-4 w-4 shrink-0" />
            Download CSV
          </button>
        </div>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
      <div aria-hidden className="pointer-events-none absolute left-[-10000px] top-0">
        <div ref={captureRef} className="w-fit">
          <RelaysExportCapture meetName={meetName} iconUrl={iconUrl} events={events} />
        </div>
      </div>
    </div>
  )
}
