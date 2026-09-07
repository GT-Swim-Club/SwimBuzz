"use client"

import dynamic from "next/dynamic"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

// react-pdf pulls in pdfjs-dist, which touches browser-only globals (DOMMatrix) at module
// evaluation time, so it must never be evaluated during SSR.
const PdfDocumentViewer = dynamic(() => import("./PdfDocumentViewer"), {
  ssr: false,
  loading: () => (
    <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground-secondary shadow-sm">
      Loading document…
    </div>
  ),
})

type FilePreviewDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  url: string
  forcePdf?: boolean
}

type PreviewKind = "pdf" | "image" | "embed"

function getPdfPreviewUrl(url: string): string {
  if (url.startsWith("/")) return url
  return `/api/file-preview?url=${encodeURIComponent(url)}`
}

function getPreviewKind(url: string, title: string): PreviewKind {
  const fileName = `${url.split("?")[0]} ${title}`.toLowerCase()
  if (fileName.includes(".pdf")) return "pdf"
  if (/\.(avif|gif|heic|jpeg|jpg|png|svg|webp)(?:\s|$)/.test(fileName)) {
    return "image"
  }
  return "embed"
}

function IconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}
      />
    </svg>
  )
}

function ZoomIcon({ direction }: { direction: "in" | "out" }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" d="M16 16l4 4" />
      <path strokeLinecap="round" d={direction === "in" ? "M11 8v6M8 11h6" : "M8 11h6"} />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export function FilePreviewDialog({
  open,
  onClose,
  title,
  url,
  forcePdf = false,
}: FilePreviewDialogProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [pdfFailed, setPdfFailed] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const kind = forcePdf ? "pdf" : getPreviewKind(url, title)
  const showingPdf = kind === "pdf"

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])

  useEffect(() => {
    if (!open || !showingPdf || !numPages) return
    const container = scrollContainerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const currentPage = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (currentPage) {
          const page = Number((currentPage.target as HTMLElement).dataset.page)
          if (Number.isFinite(page)) setPageNumber(page)
        }
      },
      { root: container, threshold: 0.55 }
    )

    pageRefs.current.forEach((page) => page && observer.observe(page))
    return () => observer.disconnect()
  }, [numPages, open, showingPdf])

  if (!open || typeof document === "undefined") return null

  const scrollToPage = (nextPage: number) => {
    const validPage = Math.max(1, Math.min(numPages ?? 1, nextPage))
    setPageNumber(validPage)
    pageRefs.current[validPage - 1]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background/80 text-foreground"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} preview`}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 sm:px-4">
        <IconButton label="Close preview" onClick={onClose}>
          <CloseIcon />
        </IconButton>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="hidden text-xs text-foreground-tertiary sm:block">
            {showingPdf
              ? "PDF document"
              : kind === "image"
                ? "Image preview"
                : "File preview"}
          </p>
        </div>

        {showingPdf ? (
          <nav className="hidden items-center rounded-md border border-border bg-background shadow-sm sm:flex">
            <IconButton label="Previous page" onClick={() => scrollToPage(pageNumber - 1)} disabled={pageNumber <= 1 || pdfFailed}>
              <ChevronIcon direction="left" />
            </IconButton>
            <span className="min-w-14 border-x border-border px-2 text-center text-xs tabular-nums text-foreground-secondary">
              {pageNumber} / {numPages ?? "—"}
            </span>
            <IconButton label="Next page" onClick={() => scrollToPage(pageNumber + 1)} disabled={!numPages || pageNumber >= numPages || pdfFailed}>
              <ChevronIcon direction="right" />
            </IconButton>
            <span className="mx-1 h-5 w-px bg-border" />
            <IconButton label="Zoom out" onClick={() => setZoomPercent((current) => Math.max(60, current - 20))} disabled={pdfFailed}>
              <ZoomIcon direction="out" />
            </IconButton>
            <span className="min-w-12 text-center text-xs tabular-nums text-foreground-secondary">
              {zoomPercent}%
            </span>
            <IconButton label="Zoom in" onClick={() => setZoomPercent((current) => Math.min(240, current + 20))} disabled={pdfFailed}>
              <ZoomIcon direction="in" />
            </IconButton>
          </nav>
        ) : null}
      </header>

      <main
        ref={scrollContainerRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
        className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-transparent p-4 sm:p-8"
      >
        {showingPdf ? (
          pdfFailed ? (
            <div className="max-w-sm rounded-xl border border-border bg-background p-5 text-center shadow-sm">
              <p className="text-sm font-medium text-foreground">Unable to render this PDF</p>
              <p className="mt-1 text-sm text-foreground-secondary">
                Try loading the document again.
              </p>
              <button
                type="button"
                onClick={() => setPdfFailed(false)}
                className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Try again
              </button>
            </div>
          ) : (
            <PdfDocumentViewer
              fileUrl={getPdfPreviewUrl(url)}
              zoomPercent={zoomPercent}
              numPages={numPages}
              pageRefs={pageRefs}
              onLoadSuccess={(loadedPageCount) => {
                setNumPages(loadedPageCount)
                setPageNumber((current) => Math.min(current, loadedPageCount))
              }}
              onLoadError={() => setPdfFailed(true)}
              onRenderError={() => setPdfFailed(true)}
            />
          )
        ) : kind === "image" ? (
          <img
            src={url}
            alt={title}
            className="max-h-full max-w-full object-contain shadow-xl"
          />
        ) : (
          <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <iframe title={title} src={url} className="h-full w-full border-0 bg-background" />
          </div>
        )}
      </main>

    </div>,
    document.body
  )
}

type FilePreviewButtonProps = {
  url: string
  forcePdf?: boolean
  title: string
  className?: string
  children: ReactNode
}

export default function FilePreviewButton({
  url,
  forcePdf = false,
  title,
  className,
  children,
}: FilePreviewButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <FilePreviewDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        url={url}
        forcePdf={forcePdf}
      />
    </>
  )
}
