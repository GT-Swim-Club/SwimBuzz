"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createApiClient } from "@swimbuzz/api"
import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  TOP_TIMES_LIMIT,
  topTimesEventTitle,
  type TeamAllTopTimesResponse,
  type TeamTopTime,
  type TeamTopTimesEvent,
  type TopTimesMode,
} from "@swimbuzz/shared"
import HoverDetail from "@/components/ui/HoverDetail"
import ManualRecordMark from "@/components/ui/ManualRecordMark"
import { Skeleton } from "@/components/ui/Skeleton"
import { meetRelayPath, meetSwimPath } from "@/lib/slug"

const api = createApiClient({})

/**
 * Where a row goes: its meet page, opened on the swim (`#swim-<id>`, which a relay leadoff opens as
 * its relay) or, for a relay's row, on the relay. Null when there's no imported swim or relay.
 */
function rowHref(time: TeamTopTime): string | null {
  if (!time.meetSlug) return null
  if (time.swimId) return meetSwimPath(time.meetSlug, time.swimId)
  if (time.relayKey) return meetRelayPath(time.meetSlug, time.relayKey)
  return null
}

/** Two cards to a row, like the PDF: wide enough for each swim's meet. */
const GRID = "grid gap-3 lg:grid-cols-2"
/** Relays, with all four swimmers on a line beside the meet, get the full width: one card a row, like the PDF. */
const RELAY_GRID = "grid gap-3"
/** Relay swimmers per line: all four, as the PDF lays them out (they wrap on phones). */
const RELAY_NAMES_PER_LINE = 4

/** A label's trailing marker (a relay leadoff's " (R)") apart from the name before it. */
function splitLabelMarker(label: string): { name: string; marker: string } {
  const marker = /\s\([A-Z]{1,3}\)$/.exec(label)?.[0] ?? ""
  return { name: label.slice(0, label.length - marker.length), marker }
}

/** A row's swimmers split into lines: one each for an individual swim, all four on one for a relay. */
function swimmerLines<T>(relay: boolean, swimmers: T[]): T[][] {
  if (!relay) return swimmers.map((swimmer) => [swimmer])
  const lines: T[][] = []
  for (let i = 0; i < swimmers.length; i += RELAY_NAMES_PER_LINE) lines.push(swimmers.slice(i, i + RELAY_NAMES_PER_LINE))
  return lines
}

/**
 * Blank space as tall as a row with a meet (swimmer(s) and meet side by side, or stacked on phones; a
 * relay's swimmers, wrapping onto a second line on phones), so a card with fewer than ten swims keeps a full card's height.
 */
function EmptyRow({ relay }: { relay: boolean }) {
  return (
    <div aria-hidden className="invisible flex items-start border-t border-transparent px-3.5 py-2 text-sm">
      <div className="flex flex-1 flex-col sm:flex-row">
        <div className="flex flex-col">
          <span>–</span>
          {relay ? <span className="sm:hidden">–</span> : null}
        </div>
        <span>–</span>
      </div>
    </div>
  )
}

/**
 * One event's ranked list: rank · swimmer(s) · meet · year · time. A row with an imported swim or
 * relay links to it on its meet page, which opens its detail. The meet is a column beside the
 * swimmer(s) (a line under them on phones), a relay's four swimmers share a line (wrapping on phones), and a relay with no
 * names known is one "–".
 */
function TopTimesCard({ event }: { event: TeamTopTimesEvent }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <h3 className="border-b border-border bg-fill-secondary/60 px-3.5 py-2.5 text-[15px] font-semibold text-foreground">
        {topTimesEventTitle(event)}
      </h3>
      {event.times.length === 0 ? (
        <p className="px-3.5 py-3 text-sm text-foreground-tertiary">No swims yet.</p>
      ) : (
        <ol className="divide-y divide-border">
          {event.times.map((time, index) => {
            const tied = event.times[index - 1]?.rank === time.rank || event.times[index + 1]?.rank === time.rank
            const season = time.isThisSeason
            // A row with an imported swim or relay links to it (its names then aren't links of their own).
            const href = rowHref(time)
            const opens = href !== null
            const nameClass = season ? "font-semibold text-accent" : "text-foreground"
            const labels = time.swimmers.map((swimmer) => recordSwimmerLabel(time, swimmer))
            const unnamed = labels.length === 0 || labels.every((label) => label === "–")
            const swimmers = time.swimmers.map((swimmer, i) => ({ swimmer, label: labels[i] }))
            const row = (
              <>
                <span
                  className="w-6 shrink-0 text-right font-semibold tabular-nums text-foreground-tertiary"
                >
                  <ManualRecordMark manual={time.manual} />
                  <span aria-label={tied ? `Tied ${time.rank}` : `${time.rank}`}>{tied ? `T${time.rank}` : time.rank}</span>
                </span>
                <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:gap-2.5">
                  <div className={`flex min-w-0 flex-col sm:shrink-0 ${event.relay ? "sm:w-[65%]" : "sm:w-[48%]"}`}>
                    {unnamed ? (
                      <span className={nameClass}>–</span>
                    ) : (
                      swimmerLines(event.relay, swimmers).map((line, lineIndex) => {
                        if (!event.relay) {
                          // The name truncates; a leadoff's "(R)" always shows after it.
                          const { name, marker } = splitLabelMarker(line[0]?.label ?? "")
                          return (
                            <span key={lineIndex} className={`flex min-w-0 ${nameClass}`}>
                              <span className="min-w-0 truncate">{name}</span>
                              {marker ? <span className="shrink-0 whitespace-pre">{marker}</span> : null}
                            </span>
                          )
                        }
                        return (
                          <span key={lineIndex} className={`sm:truncate ${nameClass}`}>
                            {line.map(({ label }, i) => (
                              <span key={i}>
                                {i > 0 && ", "}
                                {label}
                              </span>
                            ))}
                          </span>
                        )
                      })
                    )}
                  </div>
                  {time.meetName ? (
                    <span
                      className={`min-w-0 truncate sm:flex-1 ${season ? "text-accent" : "text-foreground-secondary"}`}
                    >
                      {time.meetName}
                    </span>
                  ) : null}
                </div>
                <span
                  tabIndex={opens ? undefined : 0}
                  className={`relative shrink-0 tabular-nums ${opens ? "" : "cursor-default"} ${season ? "font-semibold text-accent" : "text-foreground-tertiary"}`}
                >
                  {time.year}
                  <HoverDetail label={recordSetLabel(time)} />
                </span>
                <span
                  className={`w-[4.25rem] shrink-0 text-right font-mono tabular-nums ${season ? "font-semibold text-accent" : "text-foreground"}`}
                >
                  {formatRecordTime(time.timeMs)}
                </span>
              </>
            )
            const rowClass = "flex w-full items-start gap-2.5 px-3.5 py-2 text-left text-sm"
            return (
              <li key={time.key}>
                {href ? (
                  <Link href={href} className={`${rowClass} transition-colors hover:bg-background-hover`}>
                    {row}
                  </Link>
                ) : (
                  <div className={rowClass}>{row}</div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {/* Room for the rest of a top 10 ("No swims yet." takes the first row's place). */}
      {Array.from({ length: Math.max(0, TOP_TIMES_LIMIT - Math.max(1, event.times.length)) }, (_, i) => (
        <EmptyRow key={i} relay={event.relay} />
      ))}
    </section>
  )
}

/**
 * Every record event's top 10 for a gender and mode. Each is fetched once and kept, so flipping
 * back is instant (and the share menu's PDF is laid out from it with no wait).
 */
export function useAllTopTimes(gender: "F" | "M", mode: TopTimesMode, enabled: boolean) {
  const key = `${gender}|${mode}`
  const [cache, setCache] = useState<Record<string, TeamAllTopTimesResponse>>({})
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const data = cache[key]

  useEffect(() => {
    if (data || !enabled) return
    let cancelled = false
    api
      .getAllRecordTopTimes(gender, mode)
      .then((res) => !cancelled && setCache((prev) => ({ ...prev, [key]: res })))
      .catch(
        (err: unknown) =>
          !cancelled && setError({ key, message: err instanceof Error ? err.message : "Couldn't load the top 10" })
      )
    return () => {
      cancelled = true
    }
  }, [data, enabled, key, gender, mode])

  return { key, data, error: error?.key === key && !data ? error.message : null }
}

/** Name widths per line, varied so the cards don't look stamped. */
const NAME_WIDTHS = ["w-28", "w-32", "w-24", "w-36", "w-28", "w-20", "w-32", "w-24", "w-28", "w-32"]

/** Mirrors the board: a grid of event cards, each a title band over ten rank · name · meet · year · time lines. */
function TopTimesSkeleton() {
  return (
    <div aria-busy className={GRID}>
      {Array.from({ length: 6 }, (_, card) => (
        <div key={card} className="overflow-hidden rounded-xl border border-border-secondary bg-background">
          <div className="border-b border-border-secondary bg-fill-secondary/60 px-3.5 py-3">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="divide-y divide-border-secondary">
            {NAME_WIDTHS.map((_, line) => (
              <div key={line} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <Skeleton className="h-3.5 w-5" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:gap-2.5">
                  <div className="sm:w-[48%] sm:shrink-0">
                    <Skeleton className={`h-3.5 ${NAME_WIDTHS[(line + card * 3) % NAME_WIDTHS.length]}`} />
                  </div>
                  {/* The meet: a column on wider screens, a line under the name on phones. */}
                  <Skeleton className={`h-3.5 ${NAME_WIDTHS[(line + card * 3 + 5) % NAME_WIDTHS.length]}`} />
                </div>
                <Skeleton className="h-3.5 w-9" />
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Every record event's top 10 for one gender as one grid of cards, in records-table order. */
export default function TopTimesBoard({
  data,
  error,
}: {
  data: TeamAllTopTimesResponse | undefined
  error: string | null
}) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-error">
        {error}
      </p>
    )
  }
  if (!data) return <TopTimesSkeleton />

  // Runs of consecutive events of one kind, each its own grid: relays get full-width cards.
  const runs: TeamTopTimesEvent[][] = []
  for (const event of data.events) {
    const last = runs[runs.length - 1]
    if (last && last[0].relay === event.relay) last.push(event)
    else runs.push([event])
  }

  return (
    <div className="flex flex-col gap-3">
      {runs.map((run) => (
        <div key={`${run[0].gender}|${run[0].event}`} className={run[0].relay ? RELAY_GRID : GRID}>
          {run.map((event) => (
            <TopTimesCard key={`${event.gender}|${event.event}`} event={event} />
          ))}
        </div>
      ))}
    </div>
  )
}
