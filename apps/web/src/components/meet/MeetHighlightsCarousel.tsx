"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  highlightCounterList,
  highlightLists,
  meetHighlightsExportRequest,
  paginateMeetHighlights,
  TEAM_SCORE_SECTIONS,
  type HighlightListKey,
  type MeetHeaderDetails,
  type MeetHighlights,
  type StatCounter,
  type TeamScoresSection,
} from "@swimbuzz/shared"
import { LedgerIcon, LedgerPanel, LedgerStatTile } from "./Ledger"
import TeamScoresModal from "./TeamScoresModal"
import HighlightListsModal, { medalTextClass } from "./HighlightListsModal"
import ShareRosterSummaryButton from "@/app/meets/[id]/ShareRosterSummaryButton"

const AUTOPLAY_MS = 6000

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let frame = 0
    if (prefersReducedMotion()) {
      frame = requestAnimationFrame(() => setDisplay(value))
      return () => cancelAnimationFrame(frame)
    }
    const duration = Math.min(2400, Math.max(1500, 1500 + Math.log10(value + 1) * 320))
    const startedAt = performance.now()
    const step = (now: number) => {
      // rAF timestamps can precede startedAt on the first frame; clamp so values never go negative.
      const p = Math.min(Math.max((now - startedAt) / duration, 0), 1)
      setDisplay(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <>
      <span aria-hidden>{display}</span>
      <span className="sr-only">{value}</span>
    </>
  )
}

function isDropValue(value: string | number) {
  return typeof value === "string" && /^[-−]/.test(value)
}

function HighlightTile({ counter, interactive }: { counter: StatCounter; interactive?: boolean }) {
  const isText = typeof counter.value === "string" && !/^[-−+]?[\d.:]+$/.test(counter.value)
  return (
    <LedgerStatTile
      label={counter.label}
      sub={counter.hint}
      fit={isText && counter.page !== "teamScores"}
      interactive={interactive}
      value={
        typeof counter.value === "number" && Number.isFinite(counter.value) ? (
          <CountUp value={counter.value} />
        ) : (
          counter.value
        )
      }
      valueClassName={
        medalTextClass(counter.place) ??
        (isDropValue(counter.value) ? "text-success-text" : "text-foreground")
      }
    />
  )
}

/** Icon buttons in the header: 24px with a mouse, at least 32px on touch. */
const ICON_BUTTON =
  "inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill hover:text-foreground pointer-coarse:h-8 pointer-coarse:w-8"

export default function MeetHighlightsCarousel({
  highlights,
  meetId,
  meetName,
  details,
  iconUrl,
}: {
  highlights: MeetHighlights
  /** The meet, for the one-page highlights export (PDF and PNG). */
  meetId: string
  meetName: string
  details: MeetHeaderDetails
  iconUrl: string | null
}) {
  // At a meet split by team (an intrasquad), the team score cards, then each team's pages.
  const pages = paginateMeetHighlights(highlights)
  const teamScores = highlights.teamScores ?? null
  /** The lists a page's tiles open: its team's, or the meet's. */
  const listsFor = (team: string | undefined) =>
    highlightLists(highlights.teams?.find((t) => t.team === team) ?? highlights)
  const [scoresSection, setScoresSection] = useState<TeamScoresSection | null>(null)
  const [openList, setOpenList] = useState<HighlightListKey | null>(null)
  // The team whose lists the open list modal shows.
  const [listTeam, setListTeam] = useState<string | undefined>(undefined)
  const lists = listsFor(listTeam)
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)
  // Any arrow, dot, swipe, tile tap or share stops autoplay for good.
  const [stopped, setStopped] = useState(false)
  const hoverRef = useRef(false)
  const focusRef = useRef(false)
  const indexRef = useRef(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const settleRef = useRef<number | null>(null)
  const pageCount = pages.length
  const popupOpen = scoresSection != null || openList != null

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReduced(prefersReducedMotion()))
    return () => {
      cancelAnimationFrame(frame)
      if (settleRef.current != null) window.clearTimeout(settleRef.current)
    }
  }, [])

  const scrollToPage = useCallback(
    (next: number) => {
      if (pageCount === 0) return
      const target = (next + pageCount) % pageCount
      const track = trackRef.current
      if (track) track.scrollTo({ left: target * track.clientWidth, behavior: reduced ? "auto" : "smooth" })
      indexRef.current = target
      setIndex(target)
    },
    [pageCount, reduced]
  )

  useEffect(() => {
    if (pageCount <= 1 || stopped || popupOpen) return
    const timer = window.setInterval(() => {
      // The meet page mounts this card once per breakpoint; the copy hidden by CSS has no width and stays put.
      if (!trackRef.current?.clientWidth) return
      if (!hoverRef.current && !focusRef.current && !document.hidden) scrollToPage(indexRef.current + 1)
    }, AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [pageCount, stopped, popupOpen, scrollToPage])

  if (pageCount === 0) return null
  const current = Math.min(index, pageCount - 1)
  const currentTeam = pages[current]?.team

  const go = (next: number) => {
    setStopped(true)
    scrollToPage(next)
  }

  // The page follows the track once a swipe (or a programmatic scroll) settles on one.
  const onTrackScroll = () => {
    if (settleRef.current != null) window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      const track = trackRef.current
      if (!track || track.clientWidth === 0) return
      const settled = Math.min(pageCount - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth)))
      indexRef.current = settled
      setIndex(settled)
    }, 120)
  }

  const dotButtons = () =>
    pages.map((_, i) => (
      <button
        key={i}
        type="button"
        aria-label={`Show highlights ${i + 1} of ${pageCount}`}
        aria-current={i === current ? "true" : undefined}
        onClick={() => go(i)}
        // 6px dots with a mouse; on touch each gets a wider, header-tall tap target.
        className="inline-flex h-1.5 w-1.5 items-center justify-center pointer-coarse:h-8 pointer-coarse:w-4"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors ${
            i === current ? "bg-accent" : "bg-fill dark:bg-foreground-quaternary"
          }`}
        />
      </button>
    ))

  return (
    <div
      onFocus={() => (focusRef.current = true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) focusRef.current = false
      }}
    >
      <LedgerPanel
        label={currentTeam ? `Highlights · ${currentTeam}` : "Highlights"}
        onMouseEnter={() => (hoverRef.current = true)}
        onMouseLeave={() => (hoverRef.current = false)}
        labelExtra={
          pageCount > 1 ? (
            // The dots always sit by the label, even in narrow windows and on touch.
            <div className="flex items-center gap-[5px] pointer-coarse:gap-0">{dotButtons()}</div>
          ) : null
        }
        aside={
          <div className="flex items-center gap-1">
            <ShareRosterSummaryButton
              meetId={meetId}
              meetName={meetName}
              details={details}
              iconUrl={iconUrl}
              buildRequest={() => meetHighlightsExportRequest(highlights)}
              onOpen={() => setStopped(true)}
              label="Share highlights"
              copyText={false}
              compact
            />
            {pageCount > 1 ? (
              <>
                <button type="button" aria-label="Previous highlights" onClick={() => go(current - 1)} className={ICON_BUTTON}>
                  <LedgerIcon name="chevronLeft" />
                </button>
                <button type="button" aria-label="Next highlights" onClick={() => go(current + 1)} className={ICON_BUTTON}>
                  <LedgerIcon name="chevronRight" />
                </button>
              </>
            ) : null}
          </div>
        }
      >
        <div
          ref={trackRef}
          onScroll={onTrackScroll}
          onTouchStart={() => setStopped(true)}
          onWheel={(e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) setStopped(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") setStopped(true)
          }}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {pages.map((page, i) => {
            const pageLists = listsFor(page.team)
            return (
            <div
              key={i}
              aria-hidden={i !== current}
              className="grid min-w-0 flex-[0_0_100%] snap-start snap-always gap-2"
              style={{ gridTemplateColumns: `repeat(${page.counters.length}, minmax(0, 1fr))` }}
            >
              {page.counters.map((c) => {
                const section =
                  page.kind === "teamScores"
                    ? c.section ?? TEAM_SCORE_SECTIONS.find((s) => s.label === c.label)?.key
                    : undefined
                const listKey = highlightCounterList(c)
                const list = listKey ? pageLists.find((l) => l.key === listKey) : undefined
                const open =
                  teamScores && section
                    ? { label: `${c.label} team scores: ${c.value}, ${c.hint ?? ""}`, run: () => setScoresSection(section) }
                    : list
                      ? {
                          label: `${page.team ? `${page.team} ` : ""}${c.label}: ${c.value}. Show ${list.title}`,
                          run: () => {
                            setListTeam(page.team)
                            setOpenList(list.key)
                          },
                        }
                      : null
                return open ? (
                  <button
                    key={c.label}
                    type="button"
                    tabIndex={i === current ? 0 : -1}
                    aria-label={open.label}
                    onClick={() => {
                      setStopped(true)
                      open.run()
                    }}
                    className="group flex min-w-0 flex-col rounded-lg [&>div]:flex-1"
                  >
                    <HighlightTile counter={c} interactive />
                  </button>
                ) : (
                  <HighlightTile key={c.label} counter={c} />
                )
              })}
            </div>
            )
          })}
        </div>
        {teamScores ? (
          <TeamScoresModal
            teamScores={teamScores}
            section={scoresSection ?? "combined"}
            onSectionChange={setScoresSection}
            open={scoresSection != null}
            onClose={() => setScoresSection(null)}
          />
        ) : null}
        {lists.length > 0 ? (
          <HighlightListsModal
            lists={lists}
            list={openList ?? lists[0].key}
            onListChange={setOpenList}
            open={openList != null}
            onClose={() => setOpenList(null)}
            team={listTeam}
          />
        ) : null}
      </LedgerPanel>
    </div>
  )
}
