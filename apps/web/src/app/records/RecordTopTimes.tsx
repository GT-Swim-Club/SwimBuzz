"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { createApiClient } from "@swimbuzz/api"
import {
  formatRecordTime,
  recordSetLabel,
  recordSwimmerLabel,
  type RecordEventDef,
  type RecordGender,
  type TeamTopTimesResponse,
  type TopTimesMode,
} from "@swimbuzz/shared"
import { Skeleton } from "@/components/ui/Skeleton"
import { athletePath, meetPath } from "@/lib/slug"

const api = createApiClient({})

/** The Top 10 tab's line under the modal title. */
export function topTimesDescription(def: RecordEventDef, mode: TopTimesMode): string {
  if (def.relay) return "Ten fastest relays"
  return mode === "performers" ? "Ten fastest swimmers, each at their best" : "Ten fastest swims"
}

/**
 * An event's top 10 for one gender: imported swims and the event's records. Ties share a rank.
 * The parent owns the Performers / Performances switch (individual events only).
 */
export default function RecordTopTimes({
  def,
  gender,
  mode,
}: {
  def: RecordEventDef
  gender: RecordGender
  mode: TopTimesMode
}) {
  const key = `${gender}|${def.event}|${def.relay ? "performances" : mode}`
  const [result, setResult] = useState<{ key: string; data?: TeamTopTimesResponse; error?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getRecordTopTimes(gender, def.event, mode)
      .then((data) => !cancelled && setResult({ key, data }))
      .catch(
        (err: unknown) =>
          !cancelled && setResult({ key, error: err instanceof Error ? err.message : "Couldn't load the top 10" })
      )
    return () => {
      cancelled = true
    }
  }, [key, gender, def.event, mode])

  const current = result?.key === key ? result : null

  if (current?.error) {
    return (
      <p role="alert" className="text-sm text-error">
        {current.error}
      </p>
    )
  }

  if (!current?.data) {
    return (
      <ol aria-busy className="divide-y divide-border rounded-xl border border-border-secondary">
        {["w-32", "w-40", "w-28", "w-36", "w-32"].map((w, i) => (
          <li key={i} className="flex items-center gap-3 px-3.5 py-3">
            <Skeleton className="h-4 w-5" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={`h-4 ${w}`} />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="h-4 w-14" />
          </li>
        ))}
      </ol>
    )
  }

  const { times } = current.data
  if (times.length === 0) return <p className="text-sm text-foreground-secondary">No swims yet.</p>

  return (
    <ol className="divide-y divide-border rounded-xl border border-border">
      {times.map((time, index) => {
        const tied = times[index - 1]?.rank === time.rank || times[index + 1]?.rank === time.rank
        return (
          <li key={time.key} className="flex items-start gap-3 px-3.5 py-3">
            <span
              className="w-7 shrink-0 pt-px text-right text-sm font-semibold tabular-nums text-foreground-tertiary"
              aria-label={tied ? `Tied ${time.rank}` : `${time.rank}`}
            >
              {tied ? `T${time.rank}` : time.rank}
            </span>
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {time.swimmers.map((swimmer, i) =>
                  swimmer.athleteSlug ? (
                    <Link
                      key={i}
                      href={athletePath(swimmer.athleteSlug)}
                      className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {recordSwimmerLabel(time, swimmer)}
                    </Link>
                  ) : (
                    <span key={i} className="text-sm font-medium text-foreground">
                      {recordSwimmerLabel(time, swimmer)}
                    </span>
                  )
                )}
                {time.isRecord ? (
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Record</span>
                ) : null}
              </div>
              <p className="text-[13px] text-foreground-secondary">
                {time.meetSlug && time.meetName ? (
                  <>
                    {recordSetLabel({ ...time, meetName: null })} ·{" "}
                    <Link href={meetPath(time.meetSlug)} className="hover:text-primary hover:underline">
                      {time.meetName}
                    </Link>
                  </>
                ) : (
                  recordSetLabel(time)
                )}
              </p>
            </div>
            <span
              className={`shrink-0 font-mono text-sm tabular-nums ${time.isThisSeason ? "font-semibold text-accent" : "text-foreground"}`}
            >
              {formatRecordTime(time.timeMs)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
