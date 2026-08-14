"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { toPng } from "html-to-image"
import ActionIcon from "@/components/ActionIcon"
import HoverDetail from "@/components/HoverDetail"
import { practicePdfFilename } from "@/lib/practice-pdf"

function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename="([^"]+)"/)
  return match?.[1] ?? "practice.pdf"
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function PdfMenuIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 2.75H6.5a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8.25L14 2.75Z" />
      <path d="M14 2.75v5.5h5.5" />
      <path d="M8 12.25h8M8 15.5h8M8 18.75h5" />
    </svg>
  )
}

function PngMenuIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="9.25" r="1.5" />
      <path d="m4.5 18 5.25-5.25 3.25 3.25 2.25-2.25L20.5 19" />
    </svg>
  )
}

export default function ExportPracticePdfButton({
  practiceId,
  title,
  dateIso,
  captureRef,
}: {
  practiceId: string
  title: string
  dateIso: string | null
  captureRef: RefObject<HTMLElement | null>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  async function exportPdf() {
    setBusy("pdf")
    setError(null)
    setOpen(false)
    try {
      const res = await fetch(`/api/practices/${practiceId}/pdf`)
      if (!res.ok) throw new Error("Could not export PDF")
      downloadBlob(await res.blob(), filenameFromDisposition(res.headers.get("content-disposition")))
    } catch {
      setError("Could not export PDF")
    } finally {
      setBusy(null)
    }
  }

  async function exportPng() {
    const node = captureRef.current
    if (!node) {
      setError("Could not export image")
      return
    }
    setBusy("png")
    setError(null)
    setOpen(false)
    try {
      await document.fonts.ready
      const backgroundColor =
        getComputedStyle(document.body).backgroundColor ||
        getComputedStyle(document.documentElement).getPropertyValue("--brand-color-bg-container").trim() ||
        "#ffffff"
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor,
        width: node.scrollWidth,
        height: node.scrollHeight,
      })
      const res = await fetch(dataUrl)
      downloadBlob(await res.blob(), practicePdfFilename(title, dateIso).replace(/\.pdf$/, ".png"))
    } catch {
      setError("Could not export image")
    } finally {
      setBusy(null)
    }
  }

  const label = busy === "pdf" ? "Exporting PDF…" : busy === "png" ? "Exporting image…" : "Export"

  return (
    <div ref={rootRef} className="relative flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={Boolean(busy)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Export practice"
        className="group relative inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border rounded-lg bg-background hover:bg-fill transition-colors disabled:opacity-40"
      >
        <ActionIcon kind="export" className="h-5 w-5" />
        {!open && <HoverDetail label={label} />}
      </button>
      {open && (
        <div
          role="menu"
          className="export-menu-fade-in absolute right-0 top-full z-40 mt-1 w-max overflow-hidden rounded-lg border border-border bg-background-elevated py-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void exportPdf()}
            className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"
          >
            <PdfMenuIcon className="h-4 w-4 shrink-0" />
            Export PDF
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void exportPng()}
            className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-foreground hover:bg-fill"
          >
            <PngMenuIcon className="h-4 w-4 shrink-0" />
            Export PNG
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
