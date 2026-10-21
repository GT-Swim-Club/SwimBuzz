"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import HoverDetail from "@/components/ui/HoverDetail"
import { formatDateRange, formatSwimDate, formatTime } from "@/lib/utils"
import { AppIcon } from "@/components/ui/AppIcon"
import {
  compareSwimsNewestFirst,
  groupSwimsByMeet,
  isDeletableSwim,
  pageButtons,
  paginateMeetGroups,
  swimMeetHref,
  swimRoundLabel,
  type AthleteSwim,
  type SwimMarks,
} from "@/lib/athlete/swim-history"
import { MeetListThumb } from "@/app/meets/MeetListMeta"
import DeleteSwimButton from "./DeleteSwimButton"
import { DeltaPill, PbBadge } from "./SwimMarks"

const COLS_COACH =
  "grid-cols-[minmax(0,1fr)_152px_44px_112px_28px] max-[600px]:grid-cols-[minmax(0,1fr)_140px_36px_28px]"
const COLS_ATHLETE =
  "grid-cols-[minmax(0,1fr)_152px_44px_112px] max-[600px]:grid-cols-[minmax(0,1fr)_140px_36px]"

const DEFAULT_BUDGET_PX = 640
const MIN_BUDGET_PX = 360

/**
 * Vertical room the history card has before the bottom of the page's first screen,
 * so a page of meets fits without scrolling.
 */
function useHistoryBudget() {
  const cardRef = useRef<HTMLDivElement>(null)
  const [budget, setBudget] = useState(DEFAULT_BUDGET_PX)

  useEffect(() => {
    const scrollEl = document.getElementById("page-scroll")
    if (!scrollEl) return
    const measure = () => {
      const el = cardRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
      const belowTop = scrollEl.clientHeight - top - 24
      // Stacked under the sidebar the card starts past the first screen: fit a screenful instead.
      const room = belowTop >= MIN_BUDGET_PX ? belowTop : scrollEl.clientHeight - 80
      const next = Math.max(MIN_BUDGET_PX, Math.round(room))
      setBudget((prev) => (Math.abs(next - prev) > 8 ? next : prev))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(scrollEl)
    if (scrollEl.firstElementChild) ro.observe(scrollEl.firstElementChild)
    measure()
    return () => ro.disconnect()
  }, [])

  return { cardRef, budget }
}

export default function SwimHistory({
  swims,
  marks,
  isCoach,
  onOpenEvent,
  page,
  onPageChange,
  actions,
}: {
  swims: AthleteSwim[]
  marks: SwimMarks
  isCoach: boolean
  onOpenEvent: (event: string, course: string) => void
  /** 1-based; kept by the parent so returning from an event drill-down keeps the page. */
  page: number
  onPageChange: (page: number) => void
  /** Icon buttons beside the pager (import, log a swim, …). */
  actions?: ReactNode
}) {
  const { cardRef, budget } = useHistoryBudget()

  const groups = useMemo(() => groupSwimsByMeet([...swims].sort(compareSwimsNewestFirst)), [swims])
  const pages = useMemo(() => paginateMeetGroups(groups, budget), [groups, budget])
  const totalPages = Math.max(1, pages.length)
  const current = Math.min(Math.max(1, page), totalPages)
  const [first, last] = pages[current - 1] ?? [0, -1]
  const visible = groups.slice(first, last + 1)
  // The delete column only earns its space when a swim on this page can be deleted.
  const showDelete = isCoach && visible.some((group) => group.swims.some(isDeletableSwim))
  const cols = showDelete ? COLS_COACH : COLS_ATHLETE

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex min-h-[34px] items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">History</h2>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {totalPages > 1 && (
            <nav aria-label="History pages" className="flex items-center gap-0.5">
              <PagerButton
                onClick={() => onPageChange(current - 1)}
                disabled={current <= 1}
                ariaLabel="Previous page"
                iconOnly
              >
                <AppIcon name="chevronLeft" className="h-4 w-4" />
              </PagerButton>
              {pageButtons(current, totalPages).map((n, i) =>
                n === "gap" ? (
                  <span
                    key={`gap-${i}`}
                    aria-hidden
                    className="inline-flex min-w-5 justify-center text-foreground-tertiary"
                  >
                    …
                  </span>
                ) : (
                  <PagerButton
                    key={n}
                    onClick={() => onPageChange(n)}
                    active={n === current}
                    ariaLabel={`Page ${n}`}
                  >
                    {n}
                  </PagerButton>
                )
              )}
              <PagerButton
                onClick={() => onPageChange(current + 1)}
                disabled={current >= totalPages}
                ariaLabel="Next page"
                iconOnly
              >
                <AppIcon name="chevronRight" className="h-4 w-4" />
              </PagerButton>
            </nav>
          )}
          {actions}
        </div>
      </div>

      {swims.length === 0 ? (
        <div className="rounded-xl border border-border-secondary bg-background px-4 py-9 text-center shadow-xs">
          <p className="text-sm text-foreground-tertiary">No swims logged yet.</p>
        </div>
      ) : (
        <div ref={cardRef} className="overflow-hidden rounded-xl border border-border-secondary bg-background">
          {visible.map((group, gi) => (
            <div key={`${group.key}-${group.start}`} className={gi > 0 ? "border-t border-border-secondary" : ""}>
              <div
                className={`relative flex items-center gap-3 px-4 pb-2.5 pt-3.5 ${
                  group.href ? "transition-colors hover:bg-background-hover" : ""
                }`}
              >
                {group.iconUrl && <MeetListThumb iconUrl={group.iconUrl} bannerUrl={null} />}
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold leading-[22px] text-foreground">
                    {group.href ? (
                      // Stretched over the whole header, dates included.
                      <Link href={group.href} className="after:absolute after:inset-0">
                        {group.meet}
                      </Link>
                    ) : (
                      group.meet
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-tertiary">
                    {formatDateRange(group.start, group.end)}
                  </p>
                </div>
              </div>
              {group.swims.map((swim) => {
                const href = swimMeetHref(swim)
                const round = swimRoundLabel(swim.tags)
                const isCurrentPb = marks.currentPb.has(swim.id)
                const wasPb = marks.pbAtTime.has(swim.id)
                const time = formatTime(swim.timeMs)
                return (
                  <div
                    key={swim.id}
                    className={`group relative grid ${cols} items-center gap-3 border-t border-border-secondary px-4 py-3 text-[15px] leading-[22px] max-[600px]:gap-2 ${
                      href ? "transition-colors hover:bg-background-hover" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenEvent(swim.event, swim.course)}
                        className="relative z-[1] truncate text-left font-semibold text-foreground transition-colors hover:text-primary"
                      >
                        {swim.event}
                      </button>
                      <span className="shrink-0 text-foreground-secondary">{swim.course}</span>
                      {round && <span className="truncate text-foreground-secondary">{round}</span>}
                    </span>
                    <span className="flex items-center justify-end gap-2.5 font-mono font-medium tabular-nums text-foreground">
                      <DeltaPill delta={marks.improvement.get(swim.id) ?? null} />
                      <span className="w-20 shrink-0 text-right">
                        {href ? (
                          // Stretched over the whole row; the event name, badges and delete sit above it.
                          <Link
                            href={href}
                            className="after:absolute after:inset-0"
                          >
                            {time}
                          </Link>
                        ) : (
                          time
                        )}
                      </span>
                    </span>
                    <span className="flex justify-center">
                      {(isCurrentPb || wasPb) && <PbBadge current={isCurrentPb} />}
                    </span>
                    <span className="whitespace-nowrap text-left text-sm text-foreground-secondary max-[600px]:hidden">
                      {formatSwimDate(swim.date)}
                    </span>
                    {showDelete && (
                      <span className="flex justify-end">
                        {isDeletableSwim(swim) && (
                          <DeleteSwimButton
                            swimId={swim.id}
                            event={swim.event}
                            course={swim.course}
                            timeLabel={time}
                            dateLabel={formatSwimDate(swim.date)}
                            meet={swim.meet || null}
                          />
                        )}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PagerButton({
  onClick,
  disabled = false,
  active = false,
  ariaLabel,
  iconOnly = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  active?: boolean
  ariaLabel: string
  /** Prev/next chevrons get a hover label; page numbers already say what they are. */
  iconOnly?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-xs tabular-nums transition-colors disabled:opacity-40 ${
        active
          ? "bg-primary-bg font-semibold text-accent"
          : "text-foreground-secondary enabled:hover:bg-fill-secondary enabled:hover:text-foreground"
      }`}
    >
      {children}
      {iconOnly && <HoverDetail label={ariaLabel} />}
    </button>
  )
}
