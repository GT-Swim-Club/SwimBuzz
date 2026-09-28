"use client"

import { useEffect, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import { Document, Page, pdfjs } from "react-pdf"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

// Align the control’s displayed 100% with the more readable perceived size of common PDF viewers.
const PDF_RENDER_SCALE_AT_100_PERCENT = 1.2

type PdfDocumentViewerProps = {
  fileUrl: string
  zoomPercent: number
  numPages: number | null
  pageRefs: MutableRefObject<Array<HTMLDivElement | null>>
  onLoadSuccess: (numPages: number) => void
  onLoadError: () => void
  onRenderError: () => void
}

type ZoomablePdfPageProps = {
  pageNumber: number
  scale: number
  onRenderError: () => void
}

// react-pdf blanks a page's canvas while it re-renders at a new scale. To zoom without that flash,
// keep showing the last fully rendered canvas (CSS-scaled to the new size) and render the new scale
// in a hidden layer on top, swapping it in once it's painted. Layers are keyed by scale so the
// swapped-in canvas is never re-rendered.
function ZoomablePdfPage({ pageNumber, scale, onRenderError }: ZoomablePdfPageProps) {
  const [baseSize, setBaseSize] = useState<{ width: number; height: number } | null>(null)
  const [shownScale, setShownScale] = useState(scale)
  const latestScaleRef = useRef(scale)

  useEffect(() => {
    latestScaleRef.current = scale
  }, [scale])

  const layerScales = shownScale === scale ? [scale] : [shownScale, scale]
  const shownZoomRatio = scale / shownScale

  return (
    <div
      className="relative"
      style={
        baseSize
          ? { width: Math.floor(baseSize.width * scale), height: Math.floor(baseSize.height * scale) }
          : undefined
      }
    >
      {layerScales.map((layerScale) => {
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
              renderAnnotationLayer={false}
              renderTextLayer={true}
              loading={null}
              onLoadSuccess={(page) => {
                const viewport = page.getViewport({ scale: 1 })
                setBaseSize({ width: viewport.width, height: viewport.height })
              }}
              onRenderSuccess={() => {
                if (layerScale === latestScaleRef.current) setShownScale(layerScale)
              }}
              onRenderError={onRenderError}
            />
          </div>
        )
      })}
    </div>
  )
}

export default function PdfDocumentViewer({
  fileUrl,
  zoomPercent,
  numPages,
  pageRefs,
  onLoadSuccess,
  onLoadError,
  onRenderError,
}: PdfDocumentViewerProps) {
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
      onLoadSuccess={({ numPages: loadedPageCount }) => onLoadSuccess(loadedPageCount)}
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
                onRenderError={onRenderError}
              />
            </div>
          )
        })}
      </div>
    </Document>
  )
}
