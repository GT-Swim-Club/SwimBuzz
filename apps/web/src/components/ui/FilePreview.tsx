"use client"

import dynamic from "next/dynamic"
import { type ReactNode, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react"
import { createPortal, flushSync } from "react-dom"
import HoverDetail from "./HoverDetail"
import { useEscapeToClose } from "@/lib/use-escape-to-close"

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

function PrintIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z" />
    </svg>
  )
}

function removePrintFrame(frame: HTMLIFrameElement | null) {
  if (!frame) return
  URL.revokeObjectURL(frame.src)
  frame.remove()
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

const MIN_ZOOM_PERCENT = 25
const MAX_ZOOM_PERCENT = 240
const ZOOM_STEP_PERCENT = 20

// How much one pixel of ctrl+wheel delta (a trackpad pinch, or Ctrl + mouse wheel) zooms, and the
// most a single event may count for so one mouse-wheel notch doesn't jump too far.
const WHEEL_ZOOM_SPEED = 0.01
const MAX_WHEEL_ZOOM_DELTA = 25
// ctrl+wheel has no "gesture ended" event, so a pinch counts as over after this long without one.
const WHEEL_GESTURE_END_MS = 150

function clampZoomPercent(zoomPercent: number) {
  return Math.max(MIN_ZOOM_PERCENT, Math.min(MAX_ZOOM_PERCENT, zoomPercent))
}

// Safari reports trackpad pinches as its own (non-standard) gesture events rather than ctrl+wheel.
type SafariGestureEvent = UIEvent & { scale: number; clientX?: number; clientY?: number }

// Where a gesture is centered; the middle of the screen when Safari leaves its position out.
function gesturePoint(gesture: SafariGestureEvent) {
  return {
    x: Number.isFinite(gesture.clientX) ? (gesture.clientX as number) : window.innerWidth / 2,
    y: Number.isFinite(gesture.clientY) ? (gesture.clientY as number) : window.innerHeight / 2,
  }
}

// Fallback for releasing the page counter if a Previous/Next smooth scroll stalls before it lands:
// this long with no scroll events ends the navigation.
const PAGE_NAVIGATION_STALL_MS = 1000

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
  // Where the zoom is centered (the pointer, or the viewport's center), relative to the viewport.
  viewportX: number
  viewportY: number
  // Position of that point within the page, as fractions of the page's size.
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

// A client point as a position in the scroll container's viewport (its center by default).
function getViewportPoint(container: HTMLElement, clientPoint?: { x: number; y: number }) {
  const containerRect = container.getBoundingClientRect()
  return {
    viewportX: clientPoint
      ? Math.min(container.clientWidth, Math.max(0, clientPoint.x - containerRect.left))
      : container.clientWidth / 2,
    viewportY: clientPoint
      ? Math.min(container.clientHeight, Math.max(0, clientPoint.y - containerRect.top))
      : container.clientHeight / 2,
  }
}

function getZoomAnchor(
  container: HTMLElement,
  pageElements: Array<HTMLDivElement | null>,
  clientPoint?: { x: number; y: number }
): ZoomAnchor | null {
  const { viewportX, viewportY } = getViewportPoint(container, clientPoint)
  const centerX = container.scrollLeft + viewportX
  const centerY = container.scrollTop + viewportY
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
        viewportX,
        viewportY,
        fractionX: Math.min(1, Math.max(0, (centerX - rect.left) / rect.width)),
        fractionY: Math.min(1, Math.max(0, (centerY - rect.top) / rect.height)),
      }
    }
  })
  return anchor
}

// Scroll so the anchored point of its page sits back at its spot in the viewport.
function scrollToZoomAnchor(
  container: HTMLElement,
  pageElements: Array<HTMLDivElement | null>,
  anchor: ZoomAnchor
) {
  const pageElement = pageElements[anchor.pageIndex]
  if (!pageElement) return
  const pageRect = getRectInScrollContainer(pageElement, container)
  container.scrollTop = pageRect.top + anchor.fractionY * pageRect.height - anchor.viewportY
  container.scrollLeft = pageRect.left + anchor.fractionX * pageRect.width - anchor.viewportX
}

// A pinch in progress. Its anchor is measured once, when it starts, and every frame scrolls back
// to that same spot — re-measuring each frame from the last frame's rounded layout made it drift.
type LiveZoom = {
  source: "wheel" | "gesture" | "touch"
  baseZoomPercent: number
  factor: number
  point: { x: number; y: number }
  anchor: ZoomAnchor | null
}

function clampLiveZoomFactor(live: LiveZoom, factor: number) {
  return clampZoomPercent(live.baseZoomPercent * factor) / live.baseZoomPercent
}

function touchMidpoint(touches: TouchList) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  }
}

function touchDistance(touches: TouchList) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
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
  // null until the user zooms: the page then fits the window's width, up to 100%.
  const [manualZoomPercent, setManualZoomPercent] = useState<number | null>(null)
  const [pageWidthAt100Percent, setPageWidthAt100Percent] = useState<number | null>(null)
  const [availableWidth, setAvailableWidth] = useState<number | null>(null)
  const [pdfFailed, setPdfFailed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const printFrameRef = useRef<HTMLIFrameElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Array<HTMLDivElement | null>>([])
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const pageNavigationRef = useRef<{
    targetScrollTop: number
    stallTimeout: ReturnType<typeof setTimeout>
  } | null>(null)
  const kind = forcePdf ? "pdf" : getPreviewKind(url, title)
  const showingPdf = kind === "pdf"

  const fitZoomPercent =
    pageWidthAt100Percent && availableWidth
      ? clampZoomPercent(Math.min(100, Math.floor((availableWidth / pageWidthAt100Percent) * 100)))
      : 100
  const zoomPercent = manualZoomPercent ?? fitZoomPercent

  // Every open starts fresh at page 1, fitted to the window. Callers may reuse one dialog for
  // several files, so a different file opened in place starts over too.
  const openedUrl = open ? url : null
  const [shownUrl, setShownUrl] = useState(openedUrl)
  if (openedUrl !== shownUrl) {
    setShownUrl(openedUrl)
    if (openedUrl !== null) {
      setPageNumber(1)
      setNumPages(null)
      setPageWidthAt100Percent(null)
      setManualZoomPercent(null)
      setPdfFailed(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // Make the page behind the preview inert while it's open, so find-in-page (Cmd/Ctrl+F) only
  // searches the preview instead of also counting and jumping to matches hidden behind it.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element !== dialog && !element.inert
    )
    background.forEach((element) => {
      element.inert = true
    })
    return () => {
      background.forEach((element) => {
        element.inert = false
      })
    }
  }, [open])

  useEscapeToClose(open, onClose)

  // The print iframe has to outlive the print() call (removing it cancels the print in some
  // browsers), so it stays until the next print or until the preview closes.
  useEffect(() => {
    if (open) return
    removePrintFrame(printFrameRef.current)
    printFrameRef.current = null
  }, [open])

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

  // Track the width the pages have to fit in. (The PDF view keeps its scrollbar gutter, so a
  // scrollbar appearing doesn't change this and refit the page.)
  useLayoutEffect(() => {
    if (!open || !showingPdf) return
    const container = scrollContainerRef.current
    if (!container) return
    const measure = () => {
      const style = getComputedStyle(container)
      setAvailableWidth(
        container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [open, showingPdf])

  // After a zoom re-lays out the pages, scroll so the point the zoom centered on (anchored to its
  // page) is back where it was in the viewport, instead of drifting to another page.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    zoomAnchorRef.current = null
    const container = scrollContainerRef.current
    if (!anchor || !container) return
    scrollToZoomAnchor(container, pageRefs.current, anchor)
  }, [zoomPercent])

  // null goes back to fitting the window's width. `clientPoint` is where the zoom centers (e.g. the
  // pointer during a pinch); the viewport's center by default.
  const zoomTo = (requestedZoomPercent: number | null, clientPoint?: { x: number; y: number }) => {
    const nextManualZoomPercent =
      requestedZoomPercent === null ? null : clampZoomPercent(requestedZoomPercent)
    if ((nextManualZoomPercent ?? fitZoomPercent) !== zoomPercent) {
      endPageNavigation(false)
      const container = scrollContainerRef.current
      zoomAnchorRef.current = container
        ? getZoomAnchor(container, pageRefs.current, clientPoint)
        : null
    }
    setManualZoomPercent(nextManualZoomPercent)
  }

  // The buttons and shortcuts step to the next multiple of the step, so a fitted zoom like 47%
  // lands back on round numbers.
  const stepZoom = (direction: 1 | -1) => {
    const steps = zoomPercent / ZOOM_STEP_PERCENT
    zoomTo(
      direction > 0
        ? (Math.floor(steps + 1e-6) + 1) * ZOOM_STEP_PERCENT
        : (Math.ceil(steps - 1e-6) - 1) * ZOOM_STEP_PERCENT
    )
  }

  const beginLiveZoom = useEffectEvent(
    (source: LiveZoom["source"], point: { x: number; y: number }): LiveZoom | null => {
      const container = scrollContainerRef.current
      if (!container || pdfFailed) return null
      endPageNavigation(false)
      return {
        source,
        baseZoomPercent: zoomPercent,
        factor: 1,
        point,
        anchor: getZoomAnchor(container, pageRefs.current, point),
      }
    }
  )

  // The anchored spot follows the fingers or pointer, so panning mid-pinch moves the page too.
  // flushSync lays out and re-scrolls within the frame, so the new size never paints at the old
  // scroll position.
  const applyLiveZoom = useEffectEvent((live: LiveZoom) => {
    const container = scrollContainerRef.current
    const anchor =
      live.anchor && container ? { ...live.anchor, ...getViewportPoint(container, live.point) } : null
    const nextZoomPercent = clampZoomPercent(live.baseZoomPercent * live.factor)
    if (nextZoomPercent === zoomPercent) {
      if (anchor && container) scrollToZoomAnchor(container, pageRefs.current, anchor)
      return
    }
    zoomAnchorRef.current = anchor
    flushSync(() => setManualZoomPercent(nextZoomPercent))
  })

  // Pinching zooms the document around the fingers or pointer instead of zooming the whole page.
  // Chrome, Edge and Firefox report a trackpad pinch as a ctrl+wheel event (as is Ctrl + mouse
  // wheel); Safari on a Mac sends gesture events instead; phones pinch with two touches.
  useEffect(() => {
    if (!open || !showingPdf) return
    const dialog = dialogRef.current
    if (!dialog) return

    let live: LiveZoom | null = null
    let frame = 0
    let wheelEndTimeout: ReturnType<typeof setTimeout> | undefined
    let touchStartDistance = 0
    let activeTouches = 0

    // Zoom updates are batched to one per frame.
    const update = (factor: number, point: { x: number; y: number }) => {
      if (!live) return
      live.factor = clampLiveZoomFactor(live, factor)
      live.point = point
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (live) applyLiveZoom(live)
      })
    }
    // Apply any update still waiting for its frame, then let the next pinch start fresh.
    const finish = () => {
      if (!live) return
      if (frame) {
        cancelAnimationFrame(frame)
        frame = 0
        applyLiveZoom(live)
      }
      live = null
    }

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      if (live && live.source !== "wheel") return
      const point = { x: event.clientX, y: event.clientY }
      live ??= beginLiveZoom("wheel", point)
      if (!live) return
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY
      const clampedDelta = Math.max(-MAX_WHEEL_ZOOM_DELTA, Math.min(MAX_WHEEL_ZOOM_DELTA, delta))
      update(live.factor * Math.exp(-clampedDelta * WHEEL_ZOOM_SPEED), point)
      clearTimeout(wheelEndTimeout)
      wheelEndTimeout = setTimeout(finish, WHEEL_GESTURE_END_MS)
    }

    // iOS Safari sends gesture events for touch pinches too (without a position), so those are left
    // to the touch handlers; preventing the default still stops it zooming the whole page.
    const onGestureStart = (event: Event) => {
      event.preventDefault()
      if (live || activeTouches > 0) return
      live = beginLiveZoom("gesture", gesturePoint(event as SafariGestureEvent))
    }
    // A gesture's scale is relative to where it started.
    const onGestureChange = (event: Event) => {
      event.preventDefault()
      if (live?.source !== "gesture") return
      const gesture = event as SafariGestureEvent
      update(gesture.scale, gesturePoint(gesture))
    }
    const onGestureEnd = (event: Event) => {
      event.preventDefault()
      if (live?.source === "gesture") finish()
    }

    const onTouchStart = (event: TouchEvent) => {
      activeTouches = event.touches.length
      if (event.touches.length !== 2 || live) return
      touchStartDistance = touchDistance(event.touches)
      if (touchStartDistance > 0) live = beginLiveZoom("touch", touchMidpoint(event.touches))
    }
    const onTouchMove = (event: TouchEvent) => {
      if (live?.source !== "touch" || event.touches.length < 2) return
      if (event.cancelable) event.preventDefault()
      update(touchDistance(event.touches) / touchStartDistance, touchMidpoint(event.touches))
    }
    const onTouchEnd = (event: TouchEvent) => {
      activeTouches = event.touches.length
      if (live?.source === "touch" && event.touches.length < 2) finish()
    }

    dialog.addEventListener("wheel", onWheel, { passive: false })
    dialog.addEventListener("gesturestart", onGestureStart)
    dialog.addEventListener("gesturechange", onGestureChange)
    dialog.addEventListener("gestureend", onGestureEnd)
    dialog.addEventListener("touchstart", onTouchStart, { passive: true })
    dialog.addEventListener("touchmove", onTouchMove, { passive: false })
    dialog.addEventListener("touchend", onTouchEnd)
    dialog.addEventListener("touchcancel", onTouchEnd)
    return () => {
      dialog.removeEventListener("wheel", onWheel)
      dialog.removeEventListener("gesturestart", onGestureStart)
      dialog.removeEventListener("gesturechange", onGestureChange)
      dialog.removeEventListener("gestureend", onGestureEnd)
      dialog.removeEventListener("touchstart", onTouchStart)
      dialog.removeEventListener("touchmove", onTouchMove)
      dialog.removeEventListener("touchend", onTouchEnd)
      dialog.removeEventListener("touchcancel", onTouchEnd)
      clearTimeout(wheelEndTimeout)
      cancelAnimationFrame(frame)
    }
  }, [open, showingPdf])

  // Cmd/Ctrl + plus/minus zoom the document rather than the page; Cmd/Ctrl + 0 fits it back to
  // the window.
  const onZoomShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || pdfFailed) return
    if (event.key === "=" || event.key === "+") stepZoom(1)
    else if (event.key === "-" || event.key === "_") stepZoom(-1)
    else if (event.key === "0") zoomTo(null)
    else return
    event.preventDefault()
  })

  useEffect(() => {
    if (!open || !showingPdf) return
    window.addEventListener("keydown", onZoomShortcut)
    return () => window.removeEventListener("keydown", onZoomShortcut)
  }, [open, showingPdf])

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

  const fetchPdfBlob = async () => {
    const response = await fetch(getPdfPreviewUrl(url))
    if (!response.ok) throw new Error(`PDF request failed (${response.status})`)
    return response.blob()
  }

  // `<a download>` is ignored for cross-origin URLs (e.g. Supabase Storage), so fetch the
  // same-origin preview proxy as a blob and save that instead.
  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const objectUrl = URL.createObjectURL(await fetchPdfBlob())
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

  // Print the original PDF (not the rendered canvases) by loading it into a hidden same-origin
  // iframe and opening the browser's print dialog from there. If that isn't possible, open the
  // PDF in a new tab so it can be printed from the browser's own viewer.
  const printPdf = async () => {
    setPrinting(true)
    try {
      const objectUrl = URL.createObjectURL(await fetchPdfBlob())
      removePrintFrame(printFrameRef.current)
      const frame = document.createElement("iframe")
      frame.setAttribute("aria-hidden", "true")
      frame.tabIndex = -1
      Object.assign(frame.style, {
        position: "fixed",
        right: "0",
        bottom: "0",
        width: "0",
        height: "0",
        border: "0",
        opacity: "0",
        pointerEvents: "none",
      })
      frame.onload = () => {
        try {
          frame.contentWindow?.focus()
          frame.contentWindow?.print()
        } catch {
          window.open(objectUrl, "_blank", "noopener,noreferrer")
        } finally {
          setPrinting(false)
        }
      }
      frame.src = objectUrl
      document.body.appendChild(frame)
      printFrameRef.current = frame
    } catch {
      window.open(url, "_blank", "noopener,noreferrer")
      setPrinting(false)
    }
  }

  return createPortal(
    <div
      ref={dialogRef}
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
          <nav className="flex shrink-0 items-center rounded-md border border-border bg-background shadow-sm">
            {/* Page navigation needs more room than a phone-width header has; zoom always shows. */}
            <div className="hidden items-center sm:flex">
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
            </div>
            <IconButton label="Zoom out" onClick={() => stepZoom(-1)} disabled={pdfFailed || zoomPercent <= MIN_ZOOM_PERCENT}>
              <ZoomIcon direction="out" />
            </IconButton>
            <span className="flex min-w-12 items-center justify-center text-xs tabular-nums text-foreground-secondary">
              <EditableNumberField
                label="Zoom percentage"
                value={Math.round(zoomPercent)}
                maxDigits={String(MAX_ZOOM_PERCENT).length}
                onCommit={zoomTo}
                disabled={pdfFailed}
              />
              <span>%</span>
            </span>
            <IconButton label="Zoom in" onClick={() => stepZoom(1)} disabled={pdfFailed || zoomPercent >= MAX_ZOOM_PERCENT}>
              <ZoomIcon direction="in" />
            </IconButton>
          </nav>
        ) : null}

        {showingPdf ? (
          <>
            <IconButton label="Download PDF" onClick={downloadPdf} disabled={downloading}>
              <DownloadIcon />
            </IconButton>
            <IconButton label="Print PDF" onClick={printPdf} disabled={printing}>
              <PrintIcon />
            </IconButton>
          </>
        ) : null}
      </header>

      <main
        ref={scrollContainerRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
        className={`flex min-h-0 flex-1 items-start justify-center-safe overflow-auto bg-transparent p-4 sm:p-8 ${
          showingPdf ? "touch-pan-x touch-pan-y [scrollbar-gutter:stable]" : ""
        }`}
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
                className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-contrast"
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
              scrollContainerRef={scrollContainerRef}
              onLoadSuccess={({ numPages: loadedPageCount, pageWidthAt100Percent: loadedPageWidth }) => {
                setNumPages(loadedPageCount)
                setPageWidthAt100Percent(loadedPageWidth)
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
