"use client"

import { useEffect, useRef, useState } from "react"
import type { MutableRefObject, RefObject } from "react"
import { Document, Page, pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

// Align the control’s displayed 100% with the more readable perceived size of common PDF viewers.
const PDF_RENDER_SCALE_AT_100_PERCENT = 1.2

// The most pixels one page canvas may hold; past this the page renders at a lower pixel ratio.
// Phones get pdf.js's own mobile limit — iOS Safari kills the tab once canvases outgrow its memory
// budget — and everything else stays under Safari's per-canvas maximum.
const MAX_CANVAS_PIXELS_TOUCH = 5_242_880
const MAX_CANVAS_PIXELS = 16_777_216

// Pages within this distance of the viewport (as a share of its height, above and below) render
// their canvas; the rest are blank placeholders, so a long heat sheet doesn't keep every page's
// canvas in memory.
const RENDER_MARGIN = "100% 0px"

type PageSize = { width: number; height: number }

type PdfDocumentViewerProps = {
  fileUrl: string
  zoomPercent: number
  numPages: number | null
  pageRefs: MutableRefObject<Array<HTMLDivElement | null>>
  scrollContainerRef: RefObject<HTMLElement | null>
  // `pageWidthAt100Percent` is the first page's width at 100% zoom, in CSS pixels, so the viewer can
  // fit it to the window.
  onLoadSuccess: (document: { numPages: number; pageWidthAt100Percent: number }) => void
  onLoadError: () => void
  onRenderError: () => void
}

// While the zoom keeps changing (e.g. mid-pinch), the shown canvas is only CSS-scaled; the page
// re-renders at the new scale once the zoom has held still this long.
const RENDER_SETTLE_MS = 150

function canvasPixelRatio(size: PageSize | null, scale: number) {
  const deviceRatio = window.devicePixelRatio || 1
  if (!size) return deviceRatio
  const maxPixels = window.matchMedia("(pointer: coarse)").matches
    ? MAX_CANVAS_PIXELS_TOUCH
    : MAX_CANVAS_PIXELS
  const cssPixels = size.width * scale * size.height * scale
  return Math.min(deviceRatio, Math.sqrt(maxPixels / cssPixels))
}

// The scale every page's text layer renders at; it's CSS-scaled to the current zoom.
const TEXT_LAYER_SCALE = PDF_RENDER_SCALE_AT_100_PERCENT

type PageLayersProps = {
  pageNumber: number
  scale: number
  size: PageSize | null
  onRenderError: () => void
}

// react-pdf blanks a page's canvas while it re-renders at a new scale. To zoom without that flash,
// keep showing the last fully rendered canvas (CSS-scaled to the new size) and render the new scale
// in a hidden layer on top, swapping it in once it's painted. Layers are keyed by scale so the
// swapped-in canvas is never re-rendered.
function PageLayers({ pageNumber, scale, size, onRenderError }: PageLayersProps) {
  const [shownScale, setShownScale] = useState(scale)
  const [renderScale, setRenderScale] = useState(scale)
  const latestRenderScaleRef = useRef(scale)

  useEffect(() => {
    if (scale === renderScale) return
    const timeout = setTimeout(() => setRenderScale(scale), RENDER_SETTLE_MS)
    return () => clearTimeout(timeout)
  }, [scale, renderScale])

  useEffect(() => {
    latestRenderScaleRef.current = renderScale
  }, [renderScale])

  const layerScales = shownScale === renderScale ? [shownScale] : [shownScale, renderScale]
  const shownZoomRatio = scale / shownScale

  return layerScales.map((layerScale) => {
    const isShown = layerScale === shownScale
    return (
      <div
        key={layerScale}
        aria-hidden={isShown ? undefined : true}
        className={isShown ? "origin-top-left" : "pointer-events-none absolute left-0 top-0 opacity-0"}
        style={isShown && shownZoomRatio !== 1 ? { transform: `scale(${shownZoomRatio})` } : undefined}
      >
        <Page
          pageNumber={pageNumber}
          scale={layerScale}
          devicePixelRatio={canvasPixelRatio(size, layerScale)}
          renderAnnotationLayer={false}
          renderTextLayer={false}
          loading={null}
          onRenderSuccess={() => {
            if (layerScale === latestRenderScaleRef.current) setShownScale(layerScale)
          }}
          onRenderError={onRenderError}
        />
      </div>
    )
  })
}

type PageTextProps = {
  pageNumber: number
  scale: number
  onLoadSize: (size: PageSize) => void
}

// The text layer is what the browser's find (Cmd/Ctrl+F) and text selection work on. It's kept apart
// from the canvases so every page has exactly one: it's mounted for all pages, not just those near
// the viewport, so find reaches the whole document, and it renders once at a fixed scale and is
// CSS-scaled to the zoom, so zooming never rebuilds the text of every page.
function PageText({ pageNumber, scale, onLoadSize }: PageTextProps) {
  return (
    <div
      className="absolute left-0 top-0 origin-top-left"
      style={{ transform: `scale(${scale / TEXT_LAYER_SCALE})` }}
    >
      <Page
        pageNumber={pageNumber}
        scale={TEXT_LAYER_SCALE}
        renderMode="none"
        renderAnnotationLayer={false}
        renderTextLayer={true}
        canvasBackground="transparent"
        loading={null}
        error={null}
        onLoadSuccess={(page) => {
          const viewport = page.getViewport({ scale: 1 })
          onLoadSize({ width: viewport.width, height: viewport.height })
        }}
      />
    </div>
  )
}

type ZoomablePdfPageProps = {
  pageNumber: number
  scale: number
  nearViewport: boolean
  // The first page's size, for sizing this page's placeholder until it has loaded itself.
  fallbackSize: PageSize | null
  onRenderError: () => void
}

function ZoomablePdfPage({
  pageNumber,
  scale,
  nearViewport,
  fallbackSize,
  onRenderError,
}: ZoomablePdfPageProps) {
  const [loadedSize, setLoadedSize] = useState<PageSize | null>(null)
  const size = loadedSize ?? fallbackSize

  return (
    <div
      className="relative"
      style={size ? { width: Math.floor(size.width * scale), height: Math.floor(size.height * scale) } : undefined}
    >
      {nearViewport ? (
        <PageLayers pageNumber={pageNumber} scale={scale} size={size} onRenderError={onRenderError} />
      ) : null}
      <PageText pageNumber={pageNumber} scale={scale} onLoadSize={setLoadedSize} />
    </div>
  )
}

export default function PdfDocumentViewer({
  fileUrl,
  zoomPercent,
  numPages,
  pageRefs,
  scrollContainerRef,
  onLoadSuccess,
  onLoadError,
  onRenderError,
}: PdfDocumentViewerProps) {
  const [firstPage, setFirstPage] = useState<{ fileUrl: string; size: PageSize } | null>(null)
  const fallbackSize = firstPage?.fileUrl === fileUrl ? firstPage.size : null
  const [nearPages, setNearPages] = useState<ReadonlySet<number>>(() => new Set())

  useEffect(() => {
    const root = scrollContainerRef.current
    if (!root || !numPages) return
    const observer = new IntersectionObserver(
      (entries) => {
        setNearPages((previous) => {
          const next = new Set(previous)
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.page)
            if (entry.isIntersecting) next.add(page)
            else next.delete(page)
          }
          return next
        })
      },
      { root, rootMargin: RENDER_MARGIN }
    )
    pageRefs.current.slice(0, numPages).forEach((pageElement) => {
      if (pageElement) observer.observe(pageElement)
    })
    return () => observer.disconnect()
  }, [fileUrl, numPages, pageRefs, scrollContainerRef])

  return (
    <Document
      key={fileUrl}
      file={fileUrl}
      loading={
        <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground-secondary shadow-sm">
          Loading document…
        </div>
      }
      error={null}
      onLoadSuccess={(pdf) => {
        pdf.getPage(1).then((page) => {
          const viewport = page.getViewport({ scale: 1 })
          setFirstPage({ fileUrl, size: { width: viewport.width, height: viewport.height } })
          onLoadSuccess({
            numPages: pdf.numPages,
            pageWidthAt100Percent: viewport.width * PDF_RENDER_SCALE_AT_100_PERCENT,
          })
        }, onLoadError)
      }}
      onLoadError={onLoadError}
    >
      <div className="flex flex-col items-center gap-5 pb-8">
        {Array.from({ length: numPages ?? 0 }, (_, index) => {
          const page = index + 1
          return (
            <div
              key={page}
              ref={(node) => {
                pageRefs.current[index] = node
              }}
              data-page={page}
              className="scroll-mt-5 overflow-hidden rounded-sm bg-white shadow-xl ring-1 ring-black/5"
            >
              <ZoomablePdfPage
                pageNumber={page}
                scale={(zoomPercent / 100) * PDF_RENDER_SCALE_AT_100_PERCENT}
                nearViewport={nearPages.has(page)}
                fallbackSize={fallbackSize}
                onRenderError={onRenderError}
              />
            </div>
          )
        })}
      </div>
    </Document>
  )
}
