import type { MeetHighlights, StatCounter } from "@/lib/meet-stats"
import { currentSeason, parseSeason, seasonFromDate } from "@/lib/season"
import { canonicalizeStrokeEvent, normalizeEventName } from "@/lib/swim-parse"
import { formatDisplayTime, formatTime } from "@/lib/utils"

function formatDropPct(pct: number): string {
  const rounded = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)
  return `−${rounded}%`
}

export type AthleteSwimForStats = {
  id: string
  event: string
  course: string
  timeMs: number
  place: number | null
  date: Date | string
  meetId: string | null
  meetRef: { slug: string | null; season: string; name: string } | null
}

export type AthleteHighlights = MeetHighlights & {
  season: string
}

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d
}

function swimSeason(swim: AthleteSwimForStats): string {
  if (swim.meetRef?.season) {
    return parseSeason(swim.meetRef.season) ?? swim.meetRef.season
  }
  return seasonFromDate(toDate(swim.date))
}

function eventCourseKey(event: string, course: string): string {
  return `${normalizeEventName(event)}|${course}`
}

/** Prefer latest season on the athlete roster; else most recent swim's season. */
export function resolveAthleteStatsSeason(
  seasons: string[],
  swims: AthleteSwimForStats[]
): string {
  const parsed = seasons
    .map((s) => parseSeason(s))
    .filter((s): s is string => Boolean(s))
    .sort((a, b) => b.localeCompare(a))
  if (parsed[0]) return parsed[0]

  const byDate = [...swims].sort(
    (a, b) => toDate(b.date).getTime() - toDate(a.date).getTime()
  )
  if (byDate[0]) return swimSeason(byDate[0])
  return currentSeason()
}

function buildPbMaps(swims: AthleteSwimForStats[]) {
  /** event|course → best timeMs */
  const bestMs = new Map<string, number>()

  for (const s of swims) {
    if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
    const key = eventCourseKey(s.event, s.course)
    const prev = bestMs.get(key)
    if (prev == null || s.timeMs < prev) {
      bestMs.set(key, s.timeMs)
    }
  }
  return { bestMs }
}

/**
 * Athlete highlight stats for a season. Hide when fewer than 3 career swims.
 * Relay leadoffs count toward PRs (same as PB grid).
 */
export function computeAthleteHighlights(
  swims: AthleteSwimForStats[],
  seasons: string[]
): AthleteHighlights | null {
  if (swims.length < 3) return null

  const season = resolveAthleteStatsSeason(seasons, swims)
  const seasonSwims = swims.filter((s) => swimSeason(s) === season)
  const { bestMs } = buildPbMaps(swims)

  const counters: StatCounter[] = []

  // Season swims / meets
  const meetKeys = new Set<string>()
  for (const s of seasonSwims) {
    if (s.meetId) meetKeys.add(s.meetId)
    else meetKeys.add(`date:${toDate(s.date).toISOString().slice(0, 10)}`)
  }
  if (seasonSwims.length > 0) {
    counters.push({
      label: "Season swims",
      value: seasonSwims.length,
      hint: meetKeys.size > 0 ? `${meetKeys.size} meet${meetKeys.size === 1 ? "" : "s"}` : undefined,
    })
  }

  const byEvent = new Map<string, AthleteSwimForStats[]>()
  for (const s of swims) {
    if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
    const key = eventCourseKey(s.event, s.course)
    const list = byEvent.get(key) ?? []
    list.push(s)
    byEvent.set(key, list)
  }

  // Most swam this season — most swims, tie-break faster season best
  let mostSwam: { event: string; course: string; count: number; bestMs: number } | null =
    null
  for (const [key, list] of byEvent) {
    const seasonList = list.filter((s) => swimSeason(s) === season)
    if (seasonList.length === 0) continue
    let seasonBest = Infinity
    for (const s of seasonList) seasonBest = Math.min(seasonBest, s.timeMs)
    const [event, course] = key.split("|")
    const count = seasonList.length
    if (
      !mostSwam ||
      count > mostSwam.count ||
      (count === mostSwam.count && seasonBest < mostSwam.bestMs)
    ) {
      mostSwam = { event: event!, course: course!, count, bestMs: seasonBest }
    }
  }
  if (mostSwam && mostSwam.count >= 2) {
    counters.push({
      label: "Most swam",
      value: canonicalizeStrokeEvent(mostSwam.event),
      hint: `${mostSwam.course} · ${mostSwam.count} swims`,
    })
  }

  // Season PRs — unique event×course where a season swim equals lifetime best
  const seasonPrEvents = new Set<string>()
  for (const s of seasonSwims) {
    if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
    const key = eventCourseKey(s.event, s.course)
    if (bestMs.get(key) === s.timeMs) seasonPrEvents.add(key)
  }
  if (seasonPrEvents.size > 0) {
    counters.push({ label: "Season PRs", value: seasonPrEvents.size })
  }

  // Podiums this season
  let podiums = 0
  for (const s of seasonSwims) {
    if (s.place != null && s.place >= 1 && s.place <= 3) podiums += 1
  }
  if (podiums > 0) {
    counters.push({ label: "Podiums", value: podiums })
  }

  // Most improved this season — largest % drop vs pre-season PB (else first season swim)
  let mostImproved: {
    event: string
    course: string
    pct: number
    dropMs: number
  } | null = null
  for (const [key, list] of byEvent) {
    const seasonList = list.filter((s) => swimSeason(s) === season)
    if (seasonList.length === 0) continue

    let seasonBest = Infinity
    for (const s of seasonList) seasonBest = Math.min(seasonBest, s.timeMs)

    const prior = list.filter((s) => swimSeason(s) !== season)
    let baseline: number | null = null
    if (prior.length > 0) {
      baseline = Math.min(...prior.map((s) => s.timeMs))
    } else if (seasonList.length >= 2) {
      const firstSeason = [...seasonList].sort(
        (a, b) => toDate(a.date).getTime() - toDate(b.date).getTime()
      )[0]!
      baseline = firstSeason.timeMs
    }
    if (baseline == null || baseline <= 0 || seasonBest >= baseline) continue

    const dropMs = baseline - seasonBest
    const pct = (dropMs / baseline) * 100
    if (!mostImproved || pct > mostImproved.pct) {
      const [event, course] = key.split("|")
      mostImproved = { event: event!, course: course!, pct, dropMs }
    }
  }
  if (mostImproved) {
    const dropStr = formatDisplayTime(formatTime(mostImproved.dropMs))
    const pctStr = formatDropPct(mostImproved.pct)
    counters.push({
      label: "Most improved",
      value: canonicalizeStrokeEvent(mostImproved.event),
      hint: `${mostImproved.course} · −${dropStr} (${pctStr.slice(1)})`,
    })
  }

  // PR streak — consecutive recent meets (by date) that each include ≥1 PB swim
  const meetBuckets = new Map<
    string,
    { dateMs: number; hasPr: boolean }
  >()
  for (const s of swims) {
    const key = s.meetId
      ? `meet:${s.meetId}`
      : `date:${toDate(s.date).toISOString().slice(0, 10)}`
    const dateMs = toDate(s.date).getTime()
    const isPr =
      Number.isFinite(s.timeMs) &&
      s.timeMs > 0 &&
      bestMs.get(eventCourseKey(s.event, s.course)) === s.timeMs
    const prev = meetBuckets.get(key)
    if (!prev) {
      meetBuckets.set(key, { dateMs, hasPr: isPr })
    } else {
      prev.dateMs = Math.max(prev.dateMs, dateMs)
      prev.hasPr = prev.hasPr || isPr
    }
  }
  const meetsChrono = [...meetBuckets.values()].sort(
    (a, b) => b.dateMs - a.dateMs
  )
  let streak = 0
  for (const m of meetsChrono) {
    if (!m.hasPr) break
    streak += 1
  }
  if (streak >= 2) {
    counters.push({
      label: "PR streak",
      value: streak,
      hint: "meets in a row",
    })
  }

  if (counters.length === 0) return null
  return { season, counters }
}
