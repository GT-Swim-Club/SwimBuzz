"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  meetHighlightsExportRequest,
  paginateHighlights,
  TEAM_SCORE_SECTIONS,
  type MeetHeaderDetails,
  type MeetHighlights,
  type StatCounter,
  type TeamScoresSection,
} from "@swimbuzz/shared"
import { LedgerIcon, LedgerPanel, LedgerStatTile } from "./Ledger"
import TeamScoresModal from "./TeamScoresModal"
import ShareRosterSummaryButton from "@/app/meets/[id]/ShareRosterSummaryButton"
import { podiumPlaceClass } from "@/lib/utils"

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
      detail={counter.detail}
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
        counter.place != null && counter.place <= 3
          ? podiumPlaceClass(counter.place)
          : isDropValue(counter.value)
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground"
      }
    />
  )
}

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
  const pages = paginateHighlights(highlights.counters)
  const teamScores = highlights.teamScores ?? null
  const [scoresSection, setScoresSection] = useState<TeamScoresSection | null>(null)
  const [index, setIndex] = useState(0)
  const [reduced, setReduced] = useState(false)
  const pausedRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const pageCount = pages.length

  const restart = useCallback(() => {
    if (timerRef.current != null) window.clearInterval(timerRef.current)
    if (pageCount <= 1) return
    timerRef.current = window.setInterval(() => {
      if (!pausedRef.current && !document.hidden) {
        setIndex((i) => (i + 1) % pageCount)
      }
    }, AUTOPLAY_MS)
  }, [pageCount])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReduced(prefersReducedMotion()))
    restart()
    return () => {
      cancelAnimationFrame(frame)
      if (timerRef.current != null) window.clearInterval(timerRef.current)
    }
  }, [restart])

  if (pageCount === 0) return null
  const current = index % pageCount

  const go = (next: number) => {
    setIndex((next + pageCount) % pageCount)
    restart()
  }

  return (
    <LedgerPanel
      label="Highlights"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
      labelExtra={
        pageCount > 1 ? (
          <div className="flex items-center gap-[5px]">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show highlights ${i + 1} of ${pageCount}`}
                onClick={() => go(i)}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === current ? "bg-accent" : "bg-fill dark:bg-foreground-quaternary"
                }`}
              />
            ))}
          </div>
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
            label="Share highlights"
            copyText={false}
            compact
          />
          {pageCount > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous highlights"
                onClick={() => go(current - 1)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill hover:text-foreground"
              >
                <LedgerIcon name="chevronLeft" />
              </button>
              <button
                type="button"
                aria-label="Next highlights"
                onClick={() => go(current + 1)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-fill hover:text-foreground"
              >
                <LedgerIcon name="chevronRight" />
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="overflow-hidden">
        <div
          className="flex"
          style={{
            transform: `translateX(-${current * 100}%)`,
            transition: reduced ? "none" : "transform 300ms cubic-bezier(0.32,0.72,0,1)",
          }}
        >
          {pages.map((page, i) => (
            <div
              key={i}
              aria-hidden={i !== current}
              className="grid min-w-0 flex-[0_0_100%] gap-2"
              style={{ gridTemplateColumns: `repeat(${page.counters.length}, minmax(0, 1fr))` }}
            >
              {page.counters.map((c) => {
                const section =
                  page.kind === "teamScores"
                    ? TEAM_SCORE_SECTIONS.find((s) => s.label === c.label)?.key
                    : undefined
                return teamScores && section ? (
                  <button
                    key={c.label}
                    type="button"
                    tabIndex={i === current ? 0 : -1}
                    aria-label={`${c.label} team scores: ${c.value}, ${c.hint ?? ""}`}
                    onClick={() => setScoresSection(section)}
                    className="group flex min-w-0 flex-col rounded-lg focus-visible:outline-2 focus-visible:outline-primary [&>div]:flex-1"
                  >
                    <HighlightTile counter={c} interactive />
                  </button>
                ) : (
                  <HighlightTile key={c.label} counter={c} />
                )
              })}
            </div>
          ))}
        </div>
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
    </LedgerPanel>
  )
}
