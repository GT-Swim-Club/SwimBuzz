"use client"

import Link from "next/link"
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { AppIcon } from "@/components/ui/AppIcon"

/**
 * Text sizes scale with both the card's own width (`cqw` against the card's
 * `@container`) and the window (`vw`), so a wide banner reads bigger than a
 * quarter-width tile, and everything steps up on large monitors. Clamped so
 * small cards stay legible and huge screens don't get billboard text. Shared
 * by every card (upcoming, past, Trash).
 */
const TYPE = {
  title: "clamp(20px, 10px + 1.3cqw + 0.35vw, 48px)",
  meta: "clamp(13px, 10px + 0.3cqw + 0.12vw, 20px)",
  /** Base for the action buttons, which size themselves in `em`. */
  action: "clamp(13px, 9px + 0.3cqw + 0.15vw, 19px)",
}

/** Smallest a title shrinks to (as a fraction of its normal size) before it wraps instead. */
const TITLE_MIN_SCALE = 0.8
const TITLE_MIN_PX = 15

/**
 * Renders a title at `size` (any CSS font-size) on one line, shrinking it in
 * 0.5px steps until it fits — but never below TITLE_MIN_SCALE of its normal
 * size; past that it wraps onto more lines instead. Re-fits only when its own
 * width, its card's width (which drives `cqw`) or the window width (`vw`)
 * changes — never on its own size/wrap changes, so it can't retrigger itself.
 * Publishes its normal one-line box height as `data-line-box` for CardIcon.
 */
function FitTitle({
  as: Tag,
  size,
  className,
  children,
}: {
  as: "h2" | "h3"
  size: string
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const card = el.closest<HTMLElement>("[data-meet-card]")
    let lastKey = ""
    const fit = () => {
      const key = `${el.clientWidth}|${card?.clientWidth}|${window.innerWidth}`
      if (key === lastKey) return
      lastKey = key
      el.style.whiteSpace = "nowrap"
      el.style.fontSize = size
      el.style.lineHeight = "1.25"
      const normal = parseFloat(getComputedStyle(el).fontSize)
      el.dataset.lineBox = String(normal * 1.25)
      const min = Math.max(TITLE_MIN_PX, normal * TITLE_MIN_SCALE)
      let px = normal
      while (el.scrollWidth > el.clientWidth + 0.5 && px - 0.5 >= min) {
        px -= 0.5
        el.style.fontSize = `${px}px`
      }
      if (el.scrollWidth > el.clientWidth + 0.5) {
        el.style.whiteSpace = "normal"
        el.style.lineHeight = "1.2"
      }
    }
    fit()
    // Watch the parent too: the title fills its row (w-full), so the parent's
    // width changes are what reveal room to grow back into.
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    if (el.parentElement) observer.observe(el.parentElement)
    if (card) observer.observe(card)
    return () => observer.disconnect()
  }, [size, children])

  return (
    <Tag
      ref={ref}
      style={{ fontSize: size, lineHeight: 1.25 }}
      className={`m-0 w-full min-w-0 overflow-hidden whitespace-nowrap text-white ${className ?? ""}`.trim()}
    >
      {children}
    </Tag>
  )
}

/**
 * Square meet icon sized to the card's text block (eyebrow, title, date and
 * location rows) — measured, since those sizes scale with the card. The title
 * counts as its normal one-line height (`data-line-box`) whatever it actually
 * renders at: the title's width depends on this icon, so letting the icon
 * follow the title's shrinking/wrapping would make them chase each other.
 */
function CardIcon({ src, textEl }: { src: string; textEl: HTMLDivElement | null }) {
  const [size, setSize] = useState<number | null>(null)

  useLayoutEffect(() => {
    // Takes the element itself (not a ref): the text block mounts after this
    // icon in tree order, so a ref would still be empty when this first runs.
    const el = textEl
    if (!el) return
    const measure = () => {
      const title = el.querySelector<HTMLElement>("[data-line-box]")
      const lineBox = title ? parseFloat(title.dataset.lineBox ?? "") : NaN
      const height = title && lineBox ? el.offsetHeight - title.offsetHeight + lineBox : el.offsetHeight
      setSize(Math.round(height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [textEl])

  if (!size) return null
  return <img src={src} alt="" className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} />
}

/**
 * Full-bleed banner card with the meet details on a dark scrim. The whole card
 * links to the meet through a stretched overlay link; `actions` and `badge` sit
 * above it so their buttons stay independently clickable.
 */
export default function MeetGalleryCard({
  name,
  href,
  bannerUrl,
  iconUrl,
  eyebrow,
  dateLine,
  location,
  stackMeta = false,
  badge,
  actions,
}: {
  name: string
  /** Omitted for cards that can't be opened (e.g. meets in Trash). */
  href?: string
  bannerUrl: string | null
  iconUrl?: string | null
  /** Optional line above the title (e.g. "Upcoming · in 10 days"). */
  eyebrow?: ReactNode
  dateLine: ReactNode
  location: string
  /** Put location on its own line under the date (narrow cards, 3+ per row). */
  stackMeta?: boolean
  /** Top-left overlay (countdown pill, days-left tag). */
  badge?: ReactNode
  actions?: ReactNode
}) {
  const [textEl, setTextEl] = useState<HTMLDivElement | null>(null)
  const metaStyle = { fontSize: TYPE.meta }
  const dateMeta = (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <AppIcon name="calendar" className="h-[1em] w-[1em] shrink-0 opacity-85" />
      {dateLine}
    </span>
  )
  const locationMeta = location ? (
    <span className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap">
      <AppIcon name="mapPin" className="h-[1em] w-[1em] shrink-0 opacity-85" />
      <span className="min-w-0 truncate">{location}</span>
    </span>
  ) : null

  return (
    <div data-meet-card className="@container group relative flex h-full min-h-0 flex-col justify-end overflow-hidden rounded-2xl border border-border bg-fill-secondary shadow-sm transition-[box-shadow,border-color] duration-200 hover:border-primary hover:shadow-md has-[a[data-card-link]:focus-visible]:border-primary max-sm:aspect-video dark:bg-fill">
      {bannerUrl ? (
        <img
          src={bannerUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pb-16 text-foreground-tertiary">
          <AppIcon name="image" className="h-12 w-12" />
        </div>
      )}

      {href && (
        <Link href={href} data-card-link aria-label={name} className="absolute inset-0 z-[1] outline-none" />
      )}

      {badge && (
        <div className="absolute left-[clamp(12px,1.3cqw,16px)] top-[clamp(12px,1.3cqw,16px)] z-[2]">{badge}</div>
      )}

      <div className="relative flex flex-wrap items-center gap-4 bg-gradient-to-t from-black/90 via-black/78 via-55% to-transparent px-[clamp(16px,2.2cqw,28px)] pb-[clamp(16px,1.9cqw,24px)] pt-16 text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
        <div className="flex min-w-[220px] flex-1 items-center gap-[clamp(10px,1.1cqw,16px)]">
          {iconUrl && <CardIcon src={iconUrl} textEl={textEl} />}
          <div ref={setTextEl} className="flex min-w-0 flex-1 flex-col gap-1">
            {eyebrow}
            <FitTitle as="h3" size={TYPE.title} className="font-semibold tracking-[-0.01em]">
              {name}
            </FitTitle>
            <div
              className={`flex min-w-0 leading-5 text-white/85 ${stackMeta ? "flex-col items-start gap-1" : "flex-nowrap items-center gap-4"}`}
              style={metaStyle}
            >
              {dateMeta}
              {locationMeta}
            </div>
          </div>
        </div>
        {actions && (
          <div className="relative z-[2] flex shrink-0 items-center gap-[0.86em]" style={{ fontSize: TYPE.action }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Row layout ──────────────────────────────────────────────────────────────

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}

/** Max cards per row for the current viewport. Below 640px CSS stacks cards regardless. */
function useMaxPerRow(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => (window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : window.innerWidth >= 640 ? 2 : 1),
    () => 4
  )
}

/**
 * Row sizes for `n` cards with at most `max` per row (4 on desktop):
 *   up to max → one row; up to 2×max → two balanced rows, smaller first
 *   (5 → 2+3, 6 → 3+3, 7 → 3+4); beyond that, full rows of `max` stack at the
 *   bottom and the remainder above follows the same rule
 *   (9 → 2+3+4, 10 → 3+3+4, 13 → 2+3+4+4).
 * Every row fills the full width at a fixed height — a lone card is a wide
 * 3:1 banner, shared rows are 32:9 split evenly.
 */
function rowSizes(n: number, max: number): number[] {
  if (n <= 0) return []
  if (n <= max) return [n]
  if (n <= max * 2) {
    const top = Math.floor(n / 2)
    return [top, n - top]
  }
  return [...rowSizes(n - max, max), max]
}

function toRows<T>(items: T[], maxPer: number): T[][] {
  const out: T[][] = []
  let i = 0
  for (const size of rowSizes(items.length, maxPer)) {
    out.push(items.slice(i, i + size))
    i += size
  }
  return out
}

export function MeetCardRows<T extends { id: string }>({
  items,
  renderCard,
}: {
  items: T[]
  /** `rowSize` is how many cards share this card's row. */
  renderCard: (item: T, rowSize: number) => ReactNode
}) {
  const maxPer = useMaxPerRow()
  return (
    <div className="flex flex-col gap-4">
      {toRows(items, maxPer).map((row) => (
        <div
          key={row[0].id}
          className={`grid gap-4 max-sm:grid-cols-1! max-sm:aspect-auto! ${
            row.length === 1 ? "aspect-[3/1]" : "aspect-[32/9]"
          }`}
          style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`, gridTemplateRows: "minmax(0, 1fr)" }}
        >
          {row.map((item) => (
            <div key={item.id} className="min-h-0">
              {renderCard(item, row.length)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
