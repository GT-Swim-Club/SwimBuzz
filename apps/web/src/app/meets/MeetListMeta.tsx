"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AppIcon } from "@/components/ui/AppIcon"

const metaIconClass = "h-[13px] w-[13px] shrink-0 text-foreground-tertiary"
const textClass = "text-[13px] leading-[18px]"
/** Matches the line's `gap-x-1.5`. */
const GAP = 6
/** Icon + its gap inside the location item. */
const LOCATION_ICON = 13 + 5

/** A list row's image slot (px). */
const THUMB = 36

/** An image's natural size and the bounding box of its non-transparent pixels. */
type ContentBox = { width: number; height: number; x: number; y: number; w: number; h: number }

const contentBoxes = new Map<string, Promise<ContentBox | null>>()

/**
 * Finds where an icon's visible pixels actually are, so transparent margins
 * (common in uploaded logos — e.g. a round crest on a wide canvas) don't make
 * the logo render small. Cached per URL; null when the image can't be read.
 */
function contentBox(src: string): Promise<ContentBox | null> {
  let pending = contentBoxes.get(src)
  if (!pending) {
    pending = new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        try {
          const { naturalWidth: width, naturalHeight: height } = img
          const canvas = document.createElement("canvas")
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0)
          const alpha = ctx.getImageData(0, 0, width, height).data
          let x0 = width
          let y0 = height
          let x1 = -1
          let y1 = -1
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              if (alpha[(y * width + x) * 4 + 3] > 8) {
                if (x < x0) x0 = x
                if (x > x1) x1 = x
                if (y < y0) y0 = y
                if (y > y1) y1 = y
              }
            }
          }
          resolve(x1 < 0 ? null : { width, height, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 })
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = src
    })
    contentBoxes.set(src, pending)
  }
  return pending
}

/**
 * A list row's image, with no frame behind it. An icon has its transparent
 * margins trimmed and the visible logo fitted whole into the slot — round and
 * square logos fill it, wide ones show edge to edge at the largest size that
 * fits. Without an icon, the banner fills a rounded square. With neither, the
 * empty slot keeps names aligned.
 */
export function MeetListThumb({ iconUrl, bannerUrl }: { iconUrl: string | null; bannerUrl: string | null }) {
  const [box, setBox] = useState<{ src: string; box: ContentBox | null } | null>(null)

  useEffect(() => {
    if (!iconUrl) return
    let cancelled = false
    void contentBox(iconUrl).then((b) => {
      if (!cancelled) setBox({ src: iconUrl, box: b })
    })
    return () => {
      cancelled = true
    }
  }, [iconUrl])

  const slot = "h-9 w-9 shrink-0 bg-no-repeat"
  if (iconUrl) {
    const image = `url(${JSON.stringify(iconUrl)})`
    // Not measured yet: hold the empty slot rather than flash a mis-sized logo.
    if (box?.src !== iconUrl) return <div aria-hidden className={slot} />
    const b = box.box
    if (!b) return <div aria-hidden className={`${slot} bg-contain bg-center`} style={{ backgroundImage: image }} />
    const scale = Math.min(THUMB / b.w, THUMB / b.h)
    return (
      <div
        aria-hidden
        className={slot}
        style={{
          backgroundImage: image,
          backgroundSize: `${b.width * scale}px ${b.height * scale}px`,
          backgroundPosition: `${(THUMB - b.w * scale) / 2 - b.x * scale}px ${(THUMB - b.h * scale) / 2 - b.y * scale}px`,
        }}
      />
    )
  }
  return (
    <div
      aria-hidden
      className={`${slot} rounded-lg bg-cover bg-center`}
      style={bannerUrl ? { backgroundImage: `url(${JSON.stringify(bannerUrl)})` } : undefined}
    />
  )
}

/** A list row's name size, and the smallest it shrinks to before truncating. */
const NAME_PX = 18
const NAME_MIN_PX = 14

/**
 * A list row's meet name: one line at 18px, scaled down to exactly fit its
 * column when it would overflow, down to 14px — past that it truncates with
 * an ellipsis. The size is computed continuously (column width ÷ the name's
 * natural width at 18px), so it tracks a window resize smoothly instead of
 * stepping. Line height is fixed so a scaled name doesn't change the row's
 * height. Its width comes from the column, never its font size, so fitting
 * can't retrigger the observer.
 */
export function MeetListName({ children }: { children: string }) {
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let natural = 0
    const measure = () => {
      el.style.fontSize = `${NAME_PX}px`
      // The text's own width — scrollWidth can't be used, since it never
      // reports less than the box and a short name would read as "full".
      const range = document.createRange()
      range.selectNodeContents(el)
      natural = range.getBoundingClientRect().width
    }
    const fit = () => {
      if (!natural) return
      // 1px of slack so sub-pixel rounding never trips the ellipsis.
      let px = Math.max(NAME_MIN_PX, Math.min(NAME_PX, (NAME_PX * (el.clientWidth - 1)) / natural))
      el.style.fontSize = `${px}px`
      // Glyph widths don't scale perfectly linearly (hinting, kerning), so
      // nudge down if the proportional size still overflows — rarely more
      // than a step or two.
      while (el.scrollWidth > el.clientWidth && px - 0.1 >= NAME_MIN_PX) {
        px -= 0.1
        el.style.fontSize = `${px}px`
      }
    }
    measure()
    fit()
    let cancelled = false
    // Webfonts can land after first paint and change the natural width.
    void document.fonts?.ready.then(() => {
      if (cancelled) return
      measure()
      fit()
    })
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [children])

  return (
    <p
      ref={ref}
      style={{ fontSize: NAME_PX }}
      className="truncate font-semibold leading-[26px] text-foreground"
    >
      {children}
    </p>
  )
}

function Separator({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden data-sep className={`${textClass} text-foreground-tertiary ${className}`}>
      ·
    </span>
  )
}

/**
 * The line under a list row's name: whatever the hidden columns would show
 * (date below md, location below lg) plus the status. It's one line while
 * date · location · status fit; once they don't, location drops to its own
 * line under date · status. Fit is measured from each item's natural width,
 * which doesn't depend on the current arrangement, so it can't flip-flop.
 */
export default function MeetListMeta({
  date,
  location,
  status,
}: {
  date: ReactNode
  location: string
  status?: ReactNode
}) {
  const lineRef = useRef<HTMLParagraphElement>(null)
  const [stacked, setStacked] = useState(false)
  const hasLocation = !!location
  const hasStatus = !!status

  useLayoutEffect(() => {
    const line = lineRef.current
    if (!line || !hasLocation) return
    const measure = () => {
      const dateEl = line.querySelector<HTMLElement>("[data-meta-date]")
      // Date has its own column from md up, so there's nothing to stack.
      if (!dateEl || getComputedStyle(dateEl).display === "none") {
        setStacked(false)
        return
      }
      const locationText = line.querySelector<HTMLElement>("[data-meta-location]")
      const statusText = line.querySelector<HTMLElement>("[data-meta-status]")
      const sep = line.querySelector<HTMLElement>("[data-sep]")
      const sepWidth = (sep?.getBoundingClientRect().width ?? 4) + GAP * 2
      const needed =
        dateEl.getBoundingClientRect().width +
        sepWidth +
        LOCATION_ICON +
        (locationText?.scrollWidth ?? 0) +
        (statusText ? sepWidth + statusText.getBoundingClientRect().width : 0)
      setStacked(needed > line.clientWidth + 0.5)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(line)
    return () => observer.disconnect()
  }, [hasLocation, date, location, status])

  // Only appears when it has content: the status, or a column it stands in for.
  const visibility = hasStatus ? "flex" : hasLocation ? "flex lg:hidden" : "flex md:hidden"

  return (
    <p
      ref={lineRef}
      className={`min-w-0 items-baseline gap-x-1.5 gap-y-0.5 overflow-hidden whitespace-nowrap ${stacked ? "flex-wrap" : ""} ${visibility}`}
    >
      <span
        data-meta-date
        className={`inline-flex shrink-0 items-center gap-[5px] self-center tabular-nums text-foreground-secondary md:hidden ${textClass}`}
      >
        <AppIcon name="calendar" className={metaIconClass} />
        {date}
      </span>
      {stacked ? (
        hasStatus && <Separator />
      ) : (
        <>
          {(hasLocation || hasStatus) && <Separator className="md:hidden" />}
          {hasLocation && (
            <span
              className={`inline-flex min-w-0 items-center gap-[5px] self-center text-foreground-secondary lg:hidden ${textClass}`}
            >
              <AppIcon name="mapPin" className={metaIconClass} />
              <span data-meta-location className="min-w-0 truncate">
                {location}
              </span>
            </span>
          )}
          {hasLocation && hasStatus && <Separator className="lg:hidden" />}
        </>
      )}
      {hasStatus && (
        // Stacked, the status takes whatever room the date leaves (zero basis,
        // so it never wraps away from the date) and truncates. On one line,
        // location gives way first; with no location, the status truncates.
        <span
          className={`${stacked ? "min-w-0 flex-1 basis-0 truncate" : hasLocation ? "shrink-0" : "min-w-0 truncate"} ${textClass}`}
        >
          <span data-meta-status>{status}</span>
        </span>
      )}
      {stacked && (
        <span className={`inline-flex min-w-0 basis-full items-center gap-[5px] self-center text-foreground-secondary ${textClass}`}>
          <AppIcon name="mapPin" className={metaIconClass} />
          <span data-meta-location className="min-w-0 truncate">
            {location}
          </span>
        </span>
      )}
    </p>
  )
}
