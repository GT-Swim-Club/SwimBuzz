import type { MeetResultEntry, SheetEntry } from "@/lib/meet/meet-sheet-summary"
import { isRelaySignupEvent } from "@/lib/meet/meet-signup"
import { canonicalizeStrokeEvent, normalizeEventName } from "@/lib/swim/swim-parse"
import { parseTime } from "@/lib/utils"

export type StatCounter = {
  label: string
  value: string | number
  hint?: string
}

export type StatSpotlight = {
  text: string
  href?: string
  /** Substring of `text` to wrap in a link when `href` is set. */
  linkLabel?: string
}

export type MeetHighlights = {
  counters: StatCounter[]
  spotlight?: StatSpotlight | null
}

export type MeetSwimForStats = {
  id: string
  athleteId: string
  event: string
  course: string
  timeMs: number
}

export type SignupEntryForStats = {
  athleteId: string
  events: string[]
}

/** Lifetime PB map: athleteId|normalizedEvent|course → best timeMs */
export type AthletePbMap = Map<string, number>

export function pbKey(athleteId: string, event: string, course: string): string {
  return `${athleteId}|${normalizeEventName(event)}|${course}`
}

export function buildAthletePbMap(
  swims: { athleteId: string; event: string; course: string; timeMs: number }[]
): AthletePbMap {
  const map: AthletePbMap = new Map()
  for (const s of swims) {
    if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
    const key = pbKey(s.athleteId, s.event, s.course)
    const prev = map.get(key)
    if (prev == null || s.timeMs < prev) map.set(key, s.timeMs)
  }
  return map
}

function preferredPlace(entry: MeetResultEntry): number | undefined {
  const place = entry.finalPlace ?? entry.resultPlace ?? entry.prelimPlace
  if (place == null || place <= 0) return undefined
  return place
}

function bestResultTimeMs(entry: MeetResultEntry): number | null {
  if (typeof entry.timeMs === "number" && entry.timeMs > 0) return entry.timeMs
  for (const raw of [entry.finalTime, entry.resultTime, entry.prelimTime]) {
    if (!raw?.trim()) continue
    const ms = parseTime(raw)
    if (Number.isFinite(ms) && ms > 0) return Math.round(ms)
  }
  return null
}

function hasTimedResult(entry: MeetResultEntry): boolean {
  return bestResultTimeMs(entry) != null
}

function formatDeltaMs(deltaMs: number): string {
  const sign = deltaMs < 0 ? "-" : "+"
  const absSec = Math.abs(deltaMs) / 1000
  if (absSec < 60) return `${sign}${absSec.toFixed(2)}`
  const minutes = Math.floor(absSec / 60)
  const seconds = (absSec % 60).toFixed(2).padStart(5, "0")
  return `${sign}${minutes}:${seconds}`
}

function displayName(athleteName: string): string {
  // Stored as "Last, First" on many sheet rows
  if (athleteName.includes(",")) {
    const [last, first] = athleteName.split(",").map((p) => p.trim())
    if (first && last) return `${first} ${last}`
  }
  return athleteName
}

/**
 * Prep-meet highlights from signup entries (no results yet).
 */
export function computeMeetPrepHighlights(
  signupEntries: SignupEntryForStats[]
): MeetHighlights | null {
  if (signupEntries.length === 0) return null

  const counters: StatCounter[] = [
    { label: "Sign-ups", value: signupEntries.length },
  ]

  const eventCounts = new Map<string, number>()
  let individualEventSlots = 0
  for (const entry of signupEntries) {
    for (const event of entry.events) {
      if (isRelaySignupEvent(event)) continue
      individualEventSlots += 1
      const key = normalizeEventName(event)
      eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
    }
  }

  if (individualEventSlots > 0) {
    counters.push({
      label: "Avg events",
      value: (individualEventSlots / signupEntries.length).toFixed(1),
    })
  }

  let topEvent: string | null = null
  let topCount = 0
  for (const [event, count] of eventCounts) {
    if (count > topCount) {
      topCount = count
      topEvent = event
    }
  }

  if (topEvent && topCount > 0) {
    counters.push({ label: "Top event", value: canonicalizeStrokeEvent(topEvent) })
  }

  return counters.length > 0 ? { counters } : null
}

/**
 * Post-results meet highlights. Relay leadoffs count toward PRs.
 */
export function computeMeetResultHighlights(opts: {
  results: MeetResultEntry[]
  meetSwims: MeetSwimForStats[]
  pbMap: AthletePbMap
  athleteHrefById?: Map<string, string>
  /** Relay team results — used for busiest-swimmer (each leg counts). */
  relayResults?: SheetEntry[] | null
}): MeetHighlights | null {
  const { results, meetSwims, pbMap, athleteHrefById, relayResults } = opts

  const timedOrPlaced = results.filter(
    (r) => !r.isRelayLeadoff && (hasTimedResult(r) || preferredPlace(r) != null)
  )
  const hasSignal = timedOrPlaced.length > 0 || meetSwims.length > 0
  if (!hasSignal) return null

  const counters: StatCounter[] = []
  let spotlight: StatSpotlight | null = null

  // Swimmers with results
  const swimmerIds = new Set<string>()
  for (const r of results) {
    if (r.isRelayLeadoff) continue
    if (hasTimedResult(r) || preferredPlace(r) != null) {
      swimmerIds.add(r.athleteId)
    }
  }
  for (const s of meetSwims) swimmerIds.add(s.athleteId)
  if (swimmerIds.size > 0) {
    counters.push({ label: "Swimmers", value: swimmerIds.size })
  }

  // Podiums — at most one per athlete×event (prefer final place)
  const podiumKeys = new Set<string>()
  for (const r of results) {
    if (r.isRelayLeadoff) continue
    const place = preferredPlace(r)
    if (place == null || place > 3) continue
    podiumKeys.add(`${r.athleteId}|${normalizeEventName(r.event)}`)
  }
  if (podiumKeys.size > 0) {
    counters.push({ label: "Podiums", value: podiumKeys.size })
  }

  // PRs set (including relay leadoffs)
  let prCount = 0
  for (const s of meetSwims) {
    if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
    const best = pbMap.get(pbKey(s.athleteId, s.event, s.course))
    if (best != null && s.timeMs === best) prCount += 1
  }
  if (prCount > 0) {
    counters.push({ label: "PRs set", value: prCount })
  }

  // Biggest drop vs seed
  let bestDrop: {
    athleteId: string
    athleteName: string
    event: string
    deltaMs: number
  } | null = null
  for (const r of results) {
    if (r.isRelayLeadoff || !r.seedTime?.trim()) continue
    const resultMs = bestResultTimeMs(r)
    if (resultMs == null) continue
    const seedMs = parseTime(r.seedTime)
    if (!Number.isFinite(seedMs) || seedMs <= 0) continue
    const deltaMs = resultMs - seedMs
    if (deltaMs >= 0) continue
    if (!bestDrop || deltaMs < bestDrop.deltaMs) {
      bestDrop = {
        athleteId: r.athleteId,
        athleteName: r.athleteName,
        event: r.event,
        deltaMs,
      }
    }
  }
  if (bestDrop) {
    const deltaStr = formatDeltaMs(bestDrop.deltaMs)
    counters.push({
      label: "Biggest drop",
      value: deltaStr,
      hint: `${displayName(bestDrop.athleteName)} · ${bestDrop.event}`,
    })
    if (!spotlight) {
      const name = displayName(bestDrop.athleteName)
      spotlight = {
        text: `Biggest drop: ${name} ${deltaStr} in ${bestDrop.event}`,
        href: athleteHrefById?.get(bestDrop.athleteId),
        linkLabel: name,
      }
    }
  }

  // Busiest swimmer — individual results + relay legs
  const eventCountsByAthlete = new Map<
    string,
    { athleteName: string; count: number }
  >()
  function bumpBusy(athleteId: string, athleteName: string) {
    if (!athleteId || athleteId.startsWith("relay:")) return
    const prev = eventCountsByAthlete.get(athleteId)
    if (prev) prev.count += 1
    else eventCountsByAthlete.set(athleteId, { athleteName, count: 1 })
  }
  for (const r of results) {
    if (r.isRelayLeadoff) continue
    if (!hasTimedResult(r) && preferredPlace(r) == null) continue
    bumpBusy(r.athleteId, r.athleteName)
  }
  for (const relay of relayResults ?? []) {
    if (relay.entryType !== "relay_team") continue
    const hasResult =
      Boolean(relay.resultTime || relay.prelimTime || relay.finalTime) ||
      (relay.resultPlace != null && relay.resultPlace > 0) ||
      (relay.finalPlace != null && relay.finalPlace > 0) ||
      (relay.prelimPlace != null && relay.prelimPlace > 0)
    if (!hasResult) continue
    for (const leg of relay.relaySwimmers ?? []) {
      if (!leg.athleteId) continue
      bumpBusy(leg.athleteId, leg.name || relay.athleteName)
    }
  }
  let busiest: { athleteId: string; athleteName: string; count: number } | null =
    null
  for (const [athleteId, row] of eventCountsByAthlete) {
    if (!busiest || row.count > busiest.count) {
      busiest = { athleteId, athleteName: row.athleteName, count: row.count }
    }
  }
  if (busiest && busiest.count > 1) {
    counters.push({
      label: "Busiest",
      value: displayName(busiest.athleteName),
      hint: `${busiest.count} events`,
    })
  }

  if (counters.length === 0) return null
  return { counters, spotlight }
}
