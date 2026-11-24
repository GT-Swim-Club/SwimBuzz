"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createApiClient } from "@swimbuzz/api"
import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  topTimesEventTitle,
  type TeamAllTopTimesResponse,
  type TeamTopTime,
  type TeamTopTimesEvent,
  type TopTimesMode,
} from "@swimbuzz/shared"
import HoverDetail from "@/components/ui/HoverDetail"
import ManualRecordMark from "@/components/ui/ManualRecordMark"
import { Skeleton } from "@/components/ui/Skeleton"
import { athletePath, meetRelayPath, meetSwimPath } from "@/lib/slug"

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

const GRID = "grid gap-3 md:grid-cols-2 xl:grid-cols-3"

/**
 * One event's ranked list: rank · swimmer(s) · year · time. A row with an imported swim or relay
 * links to it on its meet page, which opens its detail.
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
            const row = (
              <>
                <span
                  className="w-6 shrink-0 text-right font-semibold tabular-nums text-foreground-tertiary"
                  aria-label={tied ? `Tied ${time.rank}` : `${time.rank}`}
                >
                  {tied ? `T${time.rank}` : time.rank}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  {time.swimmers.map((swimmer, i) => {
                    const label = recordSwimmerLabel(time, swimmer)
                    const nameClass = `truncate ${season ? "font-semibold text-accent" : "text-foreground"}`
                    return (
                      <span key={i} className="flex min-w-0">
                        {swimmer.athleteSlug && !opens ? (
                          <Link
                            href={athletePath(swimmer.athleteSlug)}
                            className={`${nameClass} hover:text-primary hover:underline`}
                          >
                            {label}
                          </Link>
                        ) : (
                          <span className={nameClass}>{label}</span>
                        )}
                      </span>
                    )
                  })}
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
                  <ManualRecordMark manual={time.manual} />
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

/** Mirrors the board: a grid of event cards, each a title band over ten rank · name · year · time lines. */
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
                <Skeleton className={`h-3.5 ${NAME_WIDTHS[(line + card * 3) % NAME_WIDTHS.length]}`} />
                <Skeleton className="ml-auto h-3.5 w-9" />
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

  return (
    <div className={GRID}>
      {data.events.map((event) => (
        <TopTimesCard key={`${event.gender}|${event.event}`} event={event} />
      ))}
    </div>
  )
}
