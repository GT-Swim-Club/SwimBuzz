"use client"

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
              <Page
                pageNumber={page}
                scale={(zoomPercent / 100) * PDF_RENDER_SCALE_AT_100_PERCENT}
                renderAnnotationLayer={false}
                renderTextLayer={true}
                loading={null}
                onRenderError={onRenderError}
              />
            </div>
          )
        })}
      </div>
    </Document>
  )
}
