"use client"

import { useRef } from "react"

/** One jump button: a letter ("B") or an event number ("12"), and the section it scrolls to. */
export type SummaryJumpTarget = {
  key: string
  label: string
  /** Spoken name, e.g. "Event 12, Women 200 Free" or "Athletes starting with B". */
  ariaLabel: string
  /** The `id` of the section's card. */
  targetId: string
}

/** Room left between the pinned jump bar and the section it scrolled to. */
const JUMP_GAP_PX = 8

/** A section's DOM id for the jump bar: "summary-jump-" plus a slug of `key`. */
export function summaryJumpId(key: string): string {
  return `summary-jump-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
}

/** "A"–"Z" for a name ("Last, First"), or "#" when it doesn't start with a letter. */
export function summaryJumpLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase()
  return /[A-Z]/.test(first) ? first : "#"
}

/**
 * The roster summary's jump bar: letter buttons when it's grouped by athlete, event-number buttons
 * when grouped by event — only for letters/events listed. It pins to the top of the page while the
 * list scrolls under it (one row that scrolls sideways on a phone), and a jump lands the section
 * just below it rather than under it. Lives only on the page: the PNG/PDF exports are drawn from
 * the export request, so it never shows in them.
 */
export default function SummaryJumpNav({ label, targets }: { label: string; targets: SummaryJumpTarget[] }) {
  const navRef = useRef<HTMLElement>(null)
  if (targets.length < 2) return null

  function jump(targetId: string) {
    const el = document.getElementById(targetId)
    const scroller = document.getElementById("page-scroll")
    if (!el || !scroller) return
    // Scroll only the page area (scrollIntoView would also scroll the body), stopping short by the
    // pinned bar's height so the section's header isn't hidden under it.
    const barHeight = navRef.current?.getBoundingClientRect().height ?? 0
    const top =
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - barHeight - JUMP_GAP_PX
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    scroller.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" })
  }

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className="sticky top-0 z-20 -mx-1 mb-3 bg-background-layout/90 px-1 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background-layout/75"
    >
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {targets.map((target) => (
          <button
            key={target.key}
            type="button"
            aria-label={target.ariaLabel}
            onClick={() => jump(target.targetId)}
            className="inline-flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-secondary bg-background px-2 text-xs font-semibold tabular-nums text-foreground-secondary transition-colors hover:border-primary hover:bg-background-hover hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/35"
          >
            {target.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
