"use client"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import Modal, { ModalFooter } from "@/components/Modal"
import { FilePreviewDialog } from "@/components/FilePreview"
import MeetResourceIcon from "@/components/MeetResourceIcon"

function PhotoLightbox({
  previews,
  index,
  onClose,
  onIndexChange,
}: {
  previews: string[]
  index: number
  onClose: () => void
  onIndexChange: (updater: (prev: number) => number) => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") {
        onIndexChange((prev) => (prev - 1 + previews.length) % previews.length)
      }
      if (e.key === "ArrowRight") {
        onIndexChange((prev) => (prev + 1) % previews.length)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, onIndexChange, previews.length])

  if (!mounted) return null

  const handlePrev = () => {
    onIndexChange((prev) => (prev - 1 + previews.length) % previews.length)
  }

  const handleNext = () => {
    onIndexChange((prev) => (prev + 1) % previews.length)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="Photo fullscreen view"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Close"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {previews.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handlePrev()
            }}
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Previous image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleNext()
            }}
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Next image"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      <img
        src={previews[index]}
        alt={`Photo ${index + 1} of ${previews.length}`}
        className="relative z-10 max-h-[90dvh] max-w-[95vw] object-contain select-none"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />

      {previews.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-black/50 text-xs text-white/90 tabular-nums pointer-events-none">
          {index + 1} / {previews.length}
        </div>
      )}
    </div>,
    document.body
  )
}

export function PreviewSlideshow({ previews }: { previews: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  useEffect(() => {
    if (previews.length <= 1 || fullscreenOpen) return

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % previews.length)
    }, 5000)

    return () => clearInterval(timer)
  }, [previews.length, fullscreenOpen])

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + previews.length) % previews.length)
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % previews.length)
  }

  return (
    <>
      <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-border bg-background group">
        {/* Slides */}
        {previews.map((url, idx) => (
          <div
            key={url}
            className={`absolute inset-0 w-full h-full flex items-center justify-center transition-opacity duration-700 ${
              idx === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
            }`}
          >
            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              className="w-full h-full cursor-zoom-in"
              aria-label={`View photo ${idx + 1} fullscreen`}
            >
              <img
                src={url}
                alt={`Preview ${idx + 1}`}
                className="w-full h-full object-contain pointer-events-none"
                loading={idx === 0 ? "eager" : "lazy"}
              />
            </button>
          </div>
        ))}

        {/* Navigation arrows */}
        {previews.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors md:opacity-0 group-hover:opacity-100"
              aria-label="Previous image"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors md:opacity-0 group-hover:opacity-100"
              aria-label="Next image"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Indicators/Dots */}
        {previews.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 px-2.5 py-1.5 rounded-full bg-black/30 backdrop-blur-sm">
            {previews.map((_, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === currentIndex ? "bg-white scale-110" : "bg-white/50 hover:bg-white/70"
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {fullscreenOpen && (
        <PhotoLightbox
          previews={previews}
          index={currentIndex}
          onClose={() => setFullscreenOpen(false)}
          onIndexChange={(updater) => setCurrentIndex(updater)}
        />
      )}
    </>
  )
}

const photosButtonClassName =
  "inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill transition-colors"

export default function PhotosButtons({
  photos,
  label,
}: {
  photos: { url: string; name: string }[]
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string
    name: string
  } | null>(null)

  if (photos.length === 0) return null

  const buttonLabel =
    label ||
    (photos.length === 1
      ? photos[0].name || "Photo"
      : `Photos (${photos.length})`)

  if (photos.length === 1) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSelectedPhoto(photos[0])}
          className={photosButtonClassName}
        >
          <MeetResourceIcon kind="photos" />
          {buttonLabel}
        </button>
        <FilePreviewDialog
          open={selectedPhoto !== null}
          onClose={() => setSelectedPhoto(null)}
          title={selectedPhoto?.name || buttonLabel}
          url={selectedPhoto?.url ?? ""}
        />
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={photosButtonClassName}
      >
        <MeetResourceIcon kind="photos" />
        {buttonLabel}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Meet Photos"
        maxWidth="lg"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
            >
              Close
            </button>
          </ModalFooter>
        }
      >
        <div className="space-y-2">
          {photos.map((photo, index) => (
            <button
              key={`${photo.url}-${index}`}
              type="button"
              onClick={() => {
                setOpen(false)
                setSelectedPhoto(photo)
              }}
              className="flex w-full items-center gap-3 p-3 text-left rounded-lg border border-border bg-background hover:bg-fill transition-colors"
            >
              <MeetResourceIcon kind="photos" />
              <span className="text-sm font-medium">
                {photo.name || `Photo Link ${index + 1}`}
              </span>
            </button>
          ))}
        </div>
      </Modal>
      <FilePreviewDialog
        open={selectedPhoto !== null}
        onClose={() => setSelectedPhoto(null)}
        title={selectedPhoto?.name || "Photo"}
        url={selectedPhoto?.url ?? ""}
      />
    </>
  )
}
