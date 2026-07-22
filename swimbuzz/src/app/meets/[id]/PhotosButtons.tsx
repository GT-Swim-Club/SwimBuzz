"use client"
import { useState, useEffect } from "react"
import Modal, { ModalFooter } from "@/components/Modal"
import MeetResourceIcon from "@/components/MeetResourceIcon"

export function PreviewSlideshow({ previews }: { previews: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (previews.length <= 1) return

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % previews.length)
    }, 5000)

    return () => clearInterval(timer)
  }, [previews.length])

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + previews.length) % previews.length)
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % previews.length)
  }

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-border bg-fill-secondary dark:bg-zinc-950/80 group">
      {/* Slides */}
      {previews.map((url, idx) => (
        <div
          key={url}
          className={`absolute inset-0 w-full h-full flex items-center justify-center transition-opacity duration-700 ${
            idx === currentIndex ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <img
            src={url}
            alt={`Preview ${idx + 1}`}
            className="w-full h-full object-contain"
            loading={idx === 0 ? "eager" : "lazy"}
          />
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
  )
}

export default function PhotosButtons({
  photos,
  label,
}: {
  photos: { url: string; name: string }[]
  label?: string
}) {
  const [open, setOpen] = useState(false)

  if (photos.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary bg-background transition-colors"
      >
        <MeetResourceIcon kind="photos" />
        {label || (photos.length === 1
          ? photos[0].name || "Photo"
          : `Photos (${photos.length})`)}
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
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border"
            >
              Close
            </button>
          </ModalFooter>
        }
      >
        <div className="space-y-2">
          {photos.map((p, i) => (
            <a
              key={i}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg border border-border dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border transition-colors"
            >
              <MeetResourceIcon kind="photos" />
              <span className="text-sm font-medium">{p.name || `Photo Link ${i + 1}`}</span>
            </a>
          ))}
        </div>
      </Modal>
    </>
  )
}
