"use client"

import dynamic from "next/dynamic"
import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import HoverDetail from "./HoverDetail"

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
  /** Download file name (without extension); defaults to `title`. */
  downloadName?: string
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
  hoverLabel = label,
  onClick,
  disabled = false,
  children,
}: {
  label: string
  /** Tooltip text, when it should say more than the accessible label (e.g. a shortcut). */
  hoverLabel?: string
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
      {/* The preview dialog sits at z-[60], above HoverDetail's default z-50. */}
      <HoverDetail label={hoverLabel} className="z-[70]!" />
    </button>
  )
}

// A number shown inline in the toolbar that can be clicked and retyped: Enter commits,
// Escape or clicking away cancels and shows the current value again.
function EditableNumberField({
  label,
  value,
  maxDigits,
  onCommit,
  disabled = false,
}: {
  label: string
  value: number
  maxDigits: number
  onCommit: (typedValue: number) => void
  disabled?: boolean
}) {
  // What's typed while the field is being edited; null shows `value`.
  const [draft, setDraft] = useState<string | null>(null)
  const shownText = draft ?? String(value)

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={shownText}
      disabled={disabled}
      maxLength={maxDigits}
      onFocus={(event) => {
        setDraft(String(value))
        event.currentTarget.select()
      }}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          const typedValue = Number.parseInt(draft ?? "", 10)
          if (Number.isFinite(typedValue)) onCommit(typedValue)
          event.currentTarget.blur()
        } else if (event.key === "Escape") {
          // Cancel the edit without also closing the preview.
          event.stopPropagation()
          event.currentTarget.blur()
        }
      }}
      onBlur={() => setDraft(null)}
      // Sized to its text so it sits snug against the "/ N" or "%" beside it.
      style={{ width: `calc(${Math.max(1, shownText.length)}ch + 0.25rem)` }}
      className="rounded bg-transparent px-0.5 py-0.5 text-center text-foreground-secondary outline-none transition-colors hover:bg-fill focus:bg-fill focus:text-foreground disabled:cursor-not-allowed"
    />
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

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />
    </svg>
  )
}

function getPdfDownloadName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, "").trim() || "document"
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

const MIN_ZOOM_PERCENT = 60
const MAX_ZOOM_PERCENT = 240
const ZOOM_STEP_PERCENT = 20

// Fallback for releasing the page counter if a Previous/Next smooth scroll stalls before it lands:
// this long with no scroll events ends the navigation.
const PAGE_NAVIGATION_STALL_MS = 1000

// How long a reopened PDF waits for its pages to lay out before giving up on returning to the page
// it was closed on.
const PAGE_RESTORE_TIMEOUT_MS = 10000

// The current page is whichever shows the most height in the viewport. (An intersection
// threshold can't do this: once a zoomed page is taller than the viewport, it never crosses it.)
// Scrolled all the way down counts as the last page, which may be too short to ever be the most
// visible one.
function getMostVisiblePage(container: HTMLElement, pageElements: Array<HTMLDivElement | null>) {
  const pageCount = pageElements.filter(Boolean).length
  if (pageCount && container.scrollTop + container.clientHeight >= container.scrollHeight - 1) {
    return pageCount
  }
  const containerRect = container.getBoundingClientRect()
  let currentPage = 0
  let mostVisibleHeight = 0
  pageElements.forEach((pageElement, index) => {
    if (!pageElement) return
    const rect = pageElement.getBoundingClientRect()
    const visibleHeight =
      Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top)
    if (visibleHeight > mostVisibleHeight) {
      mostVisibleHeight = visibleHeight
      currentPage = index + 1
    }
  })
  return currentPage
}

type ZoomAnchor = {
  pageIndex: number
  // Position of the viewport's center within that page, as fractions of the page's size.
  fractionX: number
  fractionY: number
}

function getRectInScrollContainer(element: HTMLElement, container: HTMLElement) {
  const containerRect = container.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top - containerRect.top + container.scrollTop,
    left: rect.left - containerRect.left + container.scrollLeft,
    width: rect.width,
    height: rect.height,
  }
}

// The scroll position that brings a page's top (less its scroll margin) to the top of the
// viewport, clamped to how far the container can actually scroll.
function getPageScrollTop(pageElement: HTMLElement, container: HTMLElement) {
  const scrollMarginTop = parseFloat(getComputedStyle(pageElement).scrollMarginTop) || 0
  const maxScrollTop = container.scrollHeight - container.clientHeight
  return Math.round(
    Math.max(
      0,
      Math.min(maxScrollTop, getRectInScrollContainer(pageElement, container).top - scrollMarginTop)
    )
  )
}

function getZoomAnchor(
  container: HTMLElement,
  pageElements: Array<HTMLDivElement | null>
): ZoomAnchor | null {
  const centerX = container.scrollLeft + container.clientWidth / 2
  const centerY = container.scrollTop + container.clientHeight / 2
  let anchor: ZoomAnchor | null = null
  let closestDistance = Infinity
  pageElements.forEach((pageElement, pageIndex) => {
    if (!pageElement) return
    const rect = getRectInScrollContainer(pageElement, container)
    if (!rect.height || !rect.width) return
    // 0 when the center is inside this page; otherwise how far it sits above/below it.
    const distance = Math.max(rect.top - centerY, centerY - (rect.top + rect.height), 0)
    if (distance < closestDistance) {
      closestDistance = distance
      anchor = {
        pageIndex,
        fractionX: Math.min(1, Math.max(0, (centerX - rect.left) / rect.width)),
        fractionY: Math.min(1, Math.max(0, (centerY - rect.top) / rect.height)),
      }
    }
  })
  return anchor
}

export function FilePreviewDialog({
  open,
  onClose,
  title,
  url,
  forcePdf = false,
  downloadName,
}: FilePreviewDialogProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [pdfFailed, setPdfFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const pageNavigationRef = useRef<{
    targetScrollTop: number
    stallTimeout: ReturnType<typeof setTimeout>
  } | null>(null)
  const kind = forcePdf ? "pdf" : getPreviewKind(url, title)
  const showingPdf = kind === "pdf"

  // The page state survives closing so a reopened PDF can return to where it was left, but only for
  // the same document: callers may reuse one dialog for several files (and blank the URL while
  // it's closed), so opening a different file starts it over at page 1.
  const [pageStateUrl, setPageStateUrl] = useState(url)
  if (open && url !== pageStateUrl) {
    setPageStateUrl(url)
    setPageNumber(1)
    setNumPages(null)
  }

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

  // While a Previous/Next smooth scroll is in flight, the counter stays on the destination page
  // instead of flipping back to the pages being scrolled past. The hold ends when the scroll lands,
  // when the user takes over scrolling, or if the scroll stalls — and in the latter cases the
  // counter re-syncs to whatever page is actually visible.
  const endPageNavigation = (syncToVisiblePage: boolean) => {
    const navigation = pageNavigationRef.current
    if (!navigation) return
    clearTimeout(navigation.stallTimeout)
    pageNavigationRef.current = null
    const container = scrollContainerRef.current
    const currentPage = syncToVisiblePage && container ? getMostVisiblePage(container, pageRefs.current) : 0
    if (currentPage) setPageNumber(currentPage)
  }

  const startPageNavigation = (targetScrollTop: number) => {
    endPageNavigation(false)
    pageNavigationRef.current = {
      targetScrollTop,
      stallTimeout: setTimeout(() => endPageNavigation(true), PAGE_NAVIGATION_STALL_MS),
    }
  }

  const onPageNavigationScroll = useEffectEvent((scrollTop: number) => {
    const navigation = pageNavigationRef.current
    if (!navigation) return
    if (Math.abs(scrollTop - navigation.targetScrollTop) <= 1) {
      endPageNavigation(false)
      return
    }
    startPageNavigation(navigation.targetScrollTop)
  })
  const cancelPageNavigation = useEffectEvent(() => endPageNavigation(true))

  useEffect(() => {
    if (!open || !showingPdf || !numPages) return
    const container = scrollContainerRef.current
    if (!container) return

    let frame = 0
    const updateCurrentPage = () => {
      frame = 0
      const currentPage = getMostVisiblePage(container, pageRefs.current)
      if (currentPage) setPageNumber(currentPage)
    }
    const onScroll = () => {
      if (pageNavigationRef.current) {
        onPageNavigationScroll(container.scrollTop)
        return
      }
      if (!frame) frame = requestAnimationFrame(updateCurrentPage)
    }
    // The user scrolling (wheel, touch, or grabbing the scrollbar) takes over from a Previous/Next
    // navigation, so the counter should follow them again right away.
    const onUserScrollIntent = () => cancelPageNavigation()

    container.addEventListener("scroll", onScroll, { passive: true })
    container.addEventListener("wheel", onUserScrollIntent, { passive: true })
    container.addEventListener("touchstart", onUserScrollIntent, { passive: true })
    container.addEventListener("pointerdown", onUserScrollIntent)
    return () => {
      container.removeEventListener("scroll", onScroll)
      container.removeEventListener("wheel", onUserScrollIntent)
      container.removeEventListener("touchstart", onUserScrollIntent)
      container.removeEventListener("pointerdown", onUserScrollIntent)
      cancelAnimationFrame(frame)
      cancelPageNavigation()
    }
  }, [numPages, open, showingPdf])

  // Returns whether there's nothing left to restore: either the page is restored, or it's page 1,
  // where the document already opens.
  const restoreClosedPage = useEffectEvent((): boolean => {
    if (pageNumber <= 1) return true
    const container = scrollContainerRef.current
    if (!container || !numPages) return false
    const pageElements = pageRefs.current.slice(0, numPages)
    if (pageElements.length < numPages || !pageElements.every((page) => page && page.offsetHeight > 0)) {
      return false
    }
    const targetScrollTop = getPageScrollTop(pageElements[pageNumber - 1]!, container)
    if (Math.abs(container.scrollTop - targetScrollTop) > 1) {
      // Hold the counter on the restored page, as Previous/Next does, in case the page landed on
      // isn't the most visible one (e.g. a short last page).
      startPageNavigation(targetScrollTop)
      container.scrollTop = targetScrollTop
    }
    return true
  })

  // Reopening remounts the document scrolled to the top while the counter still shows the page it
  // was closed on, so jump back to that page once every page has laid out (until then, the offsets
  // above it are still changing). Scrolling first means the user has moved on, so don't.
  useEffect(() => {
    if (!open || !showingPdf) return
    const container = scrollContainerRef.current
    if (!container) return

    const startedAt = performance.now()
    let frame = 0
    const stop = () => {
      cancelAnimationFrame(frame)
      container.removeEventListener("wheel", stop)
      container.removeEventListener("touchstart", stop)
      container.removeEventListener("pointerdown", stop)
    }
    const tryRestore = () => {
      if (restoreClosedPage() || performance.now() - startedAt > PAGE_RESTORE_TIMEOUT_MS) stop()
      else frame = requestAnimationFrame(tryRestore)
    }

    container.addEventListener("wheel", stop, { passive: true })
    container.addEventListener("touchstart", stop, { passive: true })
    container.addEventListener("pointerdown", stop)
    frame = requestAnimationFrame(tryRestore)
    return stop
  }, [open, showingPdf])

  // After a zoom re-lays out the pages, scroll so the point that was at the viewport's center
  // (anchored to its page) is back at the center, instead of drifting to another page.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    zoomAnchorRef.current = null
    const container = scrollContainerRef.current
    const pageElement = anchor ? pageRefs.current[anchor.pageIndex] : null
    if (!anchor || !container || !pageElement) return

    const pageRect = getRectInScrollContainer(pageElement, container)
    container.scrollTop = pageRect.top + anchor.fractionY * pageRect.height - container.clientHeight / 2
    container.scrollLeft = pageRect.left + anchor.fractionX * pageRect.width - container.clientWidth / 2
  }, [zoomPercent])

  if (!open || typeof document === "undefined") return null

  const scrollToPage = (nextPage: number) => {
    const validPage = Math.max(1, Math.min(numPages ?? 1, nextPage))
    setPageNumber(validPage)
    const container = scrollContainerRef.current
    const pageElement = pageRefs.current[validPage - 1]
    if (!container || !pageElement) return

    const targetScrollTop = getPageScrollTop(pageElement, container)
    if (Math.abs(container.scrollTop - targetScrollTop) <= 1) {
      endPageNavigation(false)
      return
    }
    startPageNavigation(targetScrollTop)
    container.scrollTo({ top: targetScrollTop, behavior: "smooth" })
  }

  const setZoom = (requestedZoomPercent: number) => {
    const nextZoomPercent = Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, requestedZoomPercent))
    if (nextZoomPercent === zoomPercent) return
    endPageNavigation(false)
    const container = scrollContainerRef.current
    zoomAnchorRef.current = container ? getZoomAnchor(container, pageRefs.current) : null
    setZoomPercent(nextZoomPercent)
  }

  // `<a download>` is ignored for cross-origin URLs (e.g. Supabase Storage), so fetch the
  // same-origin preview proxy as a blob and save that instead.
  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const response = await fetch(getPdfPreviewUrl(url))
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const objectUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = getPdfDownloadName(downloadName ?? title)
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch {
      window.open(url, "_blank", "noopener,noreferrer")
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background/80 text-foreground"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} preview`}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 sm:px-4">
        <IconButton label="Close preview" hoverLabel="Close (Esc)" onClick={onClose}>
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
          <IconButton label="Download PDF" onClick={downloadPdf} disabled={downloading}>
            <DownloadIcon />
          </IconButton>
        ) : null}

        {showingPdf ? (
          <nav className="hidden items-center rounded-md border border-border bg-background shadow-sm sm:flex">
            <IconButton label="Previous page" onClick={() => scrollToPage(pageNumber - 1)} disabled={pageNumber <= 1 || pdfFailed}>
              <ChevronIcon direction="left" />
            </IconButton>
            <span className="flex min-w-14 items-center justify-center gap-0.5 border-x border-border px-2 text-xs tabular-nums text-foreground-secondary">
              <EditableNumberField
                label="Page number"
                value={pageNumber}
                maxDigits={String(numPages ?? pageNumber).length}
                onCommit={scrollToPage}
                disabled={!numPages || pdfFailed}
              />
              <span>/ {numPages ?? "—"}</span>
            </span>
            <IconButton label="Next page" onClick={() => scrollToPage(pageNumber + 1)} disabled={!numPages || pageNumber >= numPages || pdfFailed}>
              <ChevronIcon direction="right" />
            </IconButton>
            <span className="mx-1 h-5 w-px bg-border" />
            <IconButton label="Zoom out" onClick={() => setZoom(zoomPercent - ZOOM_STEP_PERCENT)} disabled={pdfFailed}>
              <ZoomIcon direction="out" />
            </IconButton>
            <span className="flex min-w-12 items-center justify-center text-xs tabular-nums text-foreground-secondary">
              <EditableNumberField
                label="Zoom percentage"
                value={zoomPercent}
                maxDigits={String(MAX_ZOOM_PERCENT).length}
                onCommit={setZoom}
                disabled={pdfFailed}
              />
              <span>%</span>
            </span>
            <IconButton label="Zoom in" onClick={() => setZoom(zoomPercent + ZOOM_STEP_PERCENT)} disabled={pdfFailed}>
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
        className="flex min-h-0 flex-1 items-start justify-center-safe overflow-auto bg-transparent p-4 sm:p-8"
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
  downloadName?: string
  className?: string
  children: ReactNode
}

export default function FilePreviewButton({
  url,
  forcePdf = false,
  title,
  downloadName,
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
        downloadName={downloadName}
      />
    </>
  )
}
