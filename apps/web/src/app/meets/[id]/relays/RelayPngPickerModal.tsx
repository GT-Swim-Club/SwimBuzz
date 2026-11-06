"use client"

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { relayShareEventKey, type MeetHeaderDetails, type RelayShareEvent } from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { CheckIcon } from "@/components/ui/export-menu"
import RelaysExportCapture from "./RelaysExportCapture"

const LINK_BUTTON =
  "text-xs font-medium text-primary transition-colors duration-200 hover:text-primary-hover"
const SECTION_HEADER =
  "flex items-center justify-between gap-3 border-b border-border-secondary bg-fill-secondary px-4 py-2 text-xs font-medium tabular-nums text-foreground-secondary"

/**
 * Pick which relay events go in the PNG, with a live preview of the image. The preview is the
 * node that gets captured, so the download always matches it. Mount it only while open, so every
 * event starts picked each time.
 */
export default function RelayPngPickerModal({
  open,
  onClose,
  meetName,
  details,
  iconUrl,
  events,
  busy,
  error,
  onDownload,
}: {
  open: boolean
  onClose: () => void
  meetName: string
  details: MeetHeaderDetails
  iconUrl: string | null
  /** Published relays only, in display order. */
  events: RelayShareEvent[]
  busy: boolean
  error: string | null
  /** Capture `node` (the preview at full size) and download it. */
  onDownload: (node: HTMLElement) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(events.map(relayShareEventKey)))
  const captureRef = useRef<HTMLDivElement>(null)

  const pickedEvents = events.filter((event) => picked.has(relayShareEventKey(event)))
  const allPicked = pickedEvents.length === events.length

  function toggle(key: string) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={busy}
      title="Download PNG of…"
      description="Pick the relay events to put in the image."
      maxWidth="2xl"
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-fill disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => captureRef.current && onDownload(captureRef.current)}
            disabled={busy || pickedEvents.length === 0}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-40"
          >
            {busy ? "Exporting image…" : "Download PNG"}
          </button>
        </ModalFooter>
      }
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <div className={SECTION_HEADER}>
          <span>
            {pickedEvents.length} of {events.length} events
          </span>
          <button
            type="button"
            onClick={() =>
              setPicked(allPicked ? new Set() : new Set(events.map(relayShareEventKey)))
            }
            className={LINK_BUTTON}
          >
            {allPicked ? "Deselect all" : "Select all"}
          </button>
        </div>
        <ul className="divide-y divide-border-secondary">
          {events.map((event) => {
            const key = relayShareEventKey(event)
            const checked = picked.has(key)
            return (
              <li key={key}>
                <label
                  className={`group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors duration-200 ${
                    checked ? "bg-primary/5" : "hover:bg-background-hover"
                  }`}
                >
                  <span className="relative flex h-[18px] w-[18px] shrink-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(key)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors duration-200 peer-focus-visible:border-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-primary/34 ${
                        checked
                          ? "border-primary bg-primary text-primary-contrast"
                          : "border-border bg-background text-transparent group-hover:border-primary"
                      }`}
                    >
                      <CheckIcon className="h-3 w-3" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {event.name}
                  </span>
                  <span className="shrink-0 text-xs text-foreground-secondary">
                    {event.relays.map((relay) => relay.letter).join(" · ")}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <div>
        <p className="mb-2 text-xs font-medium text-foreground-secondary">Preview</p>
        {pickedEvents.length > 0 ? (
          <ScaledPreview>
            <div ref={captureRef} className="w-max">
              <RelaysExportCapture
                meetName={meetName}
                details={details}
                iconUrl={iconUrl}
                events={pickedEvents}
              />
            </div>
          </ScaledPreview>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-foreground-secondary">
            Pick at least one event.
          </p>
        )}
      </div>
    </Modal>
  )
}

/** Shows its child at full layout size, scaled down to fit the available width. */
function ScaledPreview({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ frame: 0, width: 0, height: 0 })

  useLayoutEffect(() => {
    const frame = frameRef.current
    const content = contentRef.current
    if (!frame || !content) return
    // offsetWidth/Height are the unscaled size, so the transform never feeds back into this.
    const measure = () =>
      setSize({ frame: frame.clientWidth, width: content.offsetWidth, height: content.offsetHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const scale = size.width > 0 ? Math.min(1, size.frame / size.width) : 1
  return (
    <div
      ref={frameRef}
      className="relative overflow-hidden rounded-xl border border-border"
      style={{ height: size.height * scale }}
    >
      <div
        ref={contentRef}
        className="absolute left-0 top-0 w-max origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
