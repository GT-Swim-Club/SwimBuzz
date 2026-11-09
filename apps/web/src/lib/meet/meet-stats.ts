import type { MeetResultEntry, SheetEntry } from "@/lib/meet/meet-sheet-summary"
import { isRelaySignupEvent } from "@/lib/meet/meet-signup"
import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"
import {
  canonicalizeStrokeEvent,
  compareRelayEvents,
  compareSwimEvents,
  normalizeEventName,
} from "@/lib/swim/swim-parse"
import { formatDisplayTime, formatOrdinal, formatTime, parseTime } from "@/lib/utils"
import {
  formatPoints,
  rosterNamePreferred,
  TEAM_SCORE_SECTIONS,
  teamPlaceLabel,
  teamScoreGap,
  type MeetHighlights,
  type MeetWin,
  type NewNationalsCut,
  type StatCounter,
  type StatSpotlight,
  type TeamScores,
  type TopScorer,
} from "@swimbuzz/shared"

export type { MeetHighlights, StatCounter, StatSpotlight }

export type MeetSwimForStats = {
  id: string
  athleteId: string
  event: string
  course: string
  timeMs: number
  athleteName?: string
  gender?: string
  tags?: string
  /** Points scored (results PDF Points column). */
  points?: number | null
}

export type NationalsCutForStats = {
  event: string
  gender: string
  course: string
  timeMs: number
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

function preferredPlace(entry: PlacedEntry): number | undefined {
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

/** How many top scorers an export lists (more when tied for the last place). */
const TOP_SCORERS = 5

/** Top Performances takes in 3rds, then 2nds, only while it stays shorter than this. */
const TOP_PERFORMANCES_UNDER = 10

/** "100 Free" without a leading "Women"/"Men" (a win carries its gender apart). */
function eventLabel(event: string): string {
  return canonicalizeStrokeEvent(event).replace(/^(women|men|mixed|girls|boys)('s)?\s+/i, "")
}

type PlacedEntry = Pick<
  MeetResultEntry,
  "prelimTime" | "finalTime" | "resultTime" | "prelimPlace" | "finalPlace" | "resultPlace"
>

/** The time of the round the entry's place is from, for display. */
function winningTime(entry: PlacedEntry): string | null {
  const raw =
    entry.finalPlace != null && entry.finalPlace > 0
      ? entry.finalTime
      : entry.resultPlace != null && entry.resultPlace > 0
        ? entry.resultTime
        : entry.prelimTime
  return raw?.trim() ? formatDisplayTime(raw) : null
}

/** The time minus the seed ("-0.42"), when both parse. */
function seedDelta(time: string, seed: string | undefined): { delta?: string } {
  if (!seed?.trim()) return {}
  const timeMs = parseTime(time)
  const seedMs = parseTime(seed)
  if (!Number.isFinite(timeMs) || !Number.isFinite(seedMs) || timeMs <= 0 || seedMs <= 0) return {}
  return { delta: formatDeltaMs(Math.round(timeMs - seedMs)) }
}

/** A relay's gender from the sheet, else from its swimmers: all women, all men, or mixed. */
function relayGender(sheet: string | undefined, legGenders: (string | undefined)[]): "F" | "M" | "X" {
  if (sheet === "F" || sheet === "M" || sheet === "X") return sheet
  const known = legGenders.filter(Boolean)
  if (known.length > 0 && known.every((g) => g === "F")) return "F"
  if (known.length > 0 && known.every((g) => g === "M")) return "M"
  return "X"
}

/** A count tile's label, singular for one ("1 Win", "2 Wins"). */
function countLabel(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/** "Ann Lee", "Ann Lee & Bo Kim", "Ann Lee, Bo Kim, & Cy Diaz" (with the serial comma). */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`
}

/** "Ann Lee" → "Lee Ann": a shown name keyed for ordering by last name. */
function lastNameFirst(name: string): string {
  const space = name.lastIndexOf(" ")
  return space < 0 ? name : `${name.slice(space + 1)} ${name.slice(0, space)}`
}

/** The highest count and everyone who has it (by last name), or null when there's no one. */
function leaders(
  rows: Iterable<{ athleteName: string; sortName: string; count: number }>
): { names: string; count: number; tied: boolean } | null {
  let top: { athleteName: string; sortName: string; count: number }[] = []
  for (const row of rows) {
    if (top.length === 0 || row.count > top[0].count) top = [row]
    else if (row.count === top[0].count) top.push(row)
  }
  if (top.length === 0) return null
  const names = top
    .sort((a, b) => a.sortName.localeCompare(b.sortName))
    .map((row) => displayName(row.athleteName))
  return { names: joinNames(names), count: top[0].count, tied: top.length > 1 }
}

/** A round was swum: it has a time or a place, or the swimmer was disqualified or didn't finish. */
function roundSwum(time?: string, place?: number, status?: string): boolean {
  return Boolean(time?.trim()) || (place != null && place > 0) || /^(DQ|DNF)/i.test(status?.trim() ?? "")
}

/** Races an entry stands for: prelims and finals each count, and a timed final or a swim-off. */
function racesSwum(entry: MeetResultEntry | SheetEntry): number {
  const prelim = roundSwum(entry.prelimTime, entry.prelimPlace, entry.prelimStatus)
  const result = roundSwum(entry.resultTime, entry.resultPlace, entry.resultStatus)
  // A finals relay can keep its finals time as the result.
  const final =
    roundSwum(entry.finalTime, entry.finalPlace, entry.finalStatus) ||
    (result && "relayRound" in entry && entry.relayRound === "F")
  // Otherwise a result beside prelims or finals is one of them again, unless it's a swim-off.
  const extra = result && (entry.isSwimOff || (!prelim && !final))
  return Number(prelim) + Number(final) + Number(extra)
}

function formatDeltaMs(deltaMs: number): string {
  const sign = deltaMs < 0 ? "-" : "+"
  const absSec = Math.abs(deltaMs) / 1000
  if (absSec < 60) return `${sign}${absSec.toFixed(2)}`
  const minutes = Math.floor(absSec / 60)
  const seconds = (absSec % 60).toFixed(2).padStart(5, "0")
  return `${sign}${minutes}:${seconds}`
}

function formatDropPct(pct: number): string {
  return `-${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`
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
 * Post-results meet highlights. Relay leadoffs count toward PBs.
 */
export function computeMeetResultHighlights(opts: {
  results: MeetResultEntry[]
  meetSwims: MeetSwimForStats[]
  pbMap: AthletePbMap
  athleteHrefById?: Map<string, string>
  /** Bests from swims before this meet — used for biggest PB drop. */
  priorPbMap?: AthletePbMap
  /** Individual Nationals cuts for the meet's season. */
  nationalsCuts?: NationalsCutForStats[]
  /** Swims from earlier meets this season — a cut made there isn't new here. */
  priorSeasonSwims?: { athleteId: string; event: string; course: string; timeMs: number; tags?: string }[]
  /** Relay team results — used for busiest-swimmer (each leg counts). */
  relayResults?: SheetEntry[] | null
  /** Team standings from the results PDF — the carousel's first page. */
  teamScores?: TeamScores | null
  /** Each athlete's name as shown (their preferred name in place of the first), by id. */
  nameById?: Map<string, string>
  /** Each athlete's "Last First" (preferred first), by id — names are listed by last name. */
  sortNameById?: Map<string, string>
  /** Each athlete's gender ("F" / "M"), by id — labels each win women's or men's. */
  genderById?: Map<string, string>
  /** GTSC records set at this meet — a tile after Swimmers. */
  recordCount?: number
}): MeetHighlights | null {
  const {
    results,
    meetSwims,
    pbMap,
    priorPbMap,
    nationalsCuts,
    priorSeasonSwims,
    athleteHrefById,
    relayResults,
    teamScores,
    nameById,
    sortNameById,
    genderById,
    recordCount,
  } = opts

  /** An athlete's preferred "First Last", else the sheet's name made readable. */
  const nameOf = (athleteId: string, fallback?: string) =>
    nameById?.get(athleteId) ?? displayName(rosterNamePreferred(fallback ?? ""))
  /** An athlete's "Last First", for ordering names by last name. */
  const sortNameOf = (athleteId: string, shown: string) => sortNameById?.get(athleteId) ?? lastNameFirst(shown)

  /**
   * Podium finishes — in finals, a timed final, or prelims with no finals yet, like the Wins counter:
   * every 1st, 2nd and 3rd while they're fewer than ten, else the 1sts and 2nds while those are, else
   * just the 1sts. By place, then individual swims in event order (women before men), then relays.
   */
  function computeTopPerformances(): MeetWin[] {
    const list: MeetWin[] = []
    const seen = new Set<string>()
    for (const r of results) {
      const place = preferredPlace(r)
      if (r.isRelayLeadoff || place == null || place > 3) continue
      const key = `${r.athleteId}|${normalizeEventName(r.event)}`
      if (seen.has(key)) continue
      seen.add(key)
      const time = winningTime(r)
      if (!time) continue
      list.push({
        gender: genderById?.get(r.athleteId) === "M" ? "M" : "F",
        event: eventLabel(r.event),
        athleteName: nameOf(r.athleteId, r.athleteName),
        time,
        ...seedDelta(time, r.seedTime),
        place,
      })
    }
    for (const relay of relayResults ?? []) {
      const place = preferredPlace(relay)
      if (relay.entryType !== "relay_team" || relay.relayRound === "P" || place == null || place > 3) continue
      const legs = [...(relay.relaySwimmers ?? [])].sort((a, b) => a.leg - b.leg)
      const gender = relayGender(relay.gender, legs.map((leg) => (leg.athleteId ? genderById?.get(leg.athleteId) : undefined)))
      const event = `${eventLabel(relay.event)}${relay.relayLetter ? ` ${relay.relayLetter}` : ""}`
      const key = `relay|${gender}|${event}`
      if (seen.has(key)) continue
      seen.add(key)
      const time = winningTime(relay)
      if (!time) continue
      list.push({
        gender,
        event,
        legs: legs.map((leg) => (leg.athleteId ? nameOf(leg.athleteId, leg.name) : displayName(rosterNamePreferred(leg.name)))),
        time,
        ...seedDelta(time, relay.seedTime),
        place,
      })
    }
    const genderOrder = { F: 0, M: 1, X: 2 }
    // A relay is the win without a swimmer; individual wins come first.
    const isRelay = (win: MeetWin) => win.athleteName == null
    list.sort(
      (a, b) =>
        a.place - b.place ||
        Number(isRelay(a)) - Number(isRelay(b)) ||
        (isRelay(a) ? compareRelayEvents(a.event, b.event) : compareSwimEvents(a.event, b.event)) ||
        genderOrder[a.gender] - genderOrder[b.gender] ||
        (a.athleteName ?? "").localeCompare(b.athleteName ?? "")
    )
    const upTo = (maxPlace: number) => list.filter((win) => win.place <= maxPlace)
    return [upTo(3), upTo(2)].find((shown) => shown.length < TOP_PERFORMANCES_UNDER) ?? upTo(1)
  }

  const timedOrPlaced = results.filter(
    (r) => !r.isRelayLeadoff && (hasTimedResult(r) || preferredPlace(r) != null)
  )
  const hasSignal = timedOrPlaced.length > 0 || meetSwims.length > 0 || Boolean(teamScores)
  if (!hasSignal) return null

  const counters: StatCounter[] = []
  let spotlight: StatSpotlight | null = null

  // Team scores — our place, points and margin in each standings list
  for (const { key, label } of TEAM_SCORE_SECTIONS) {
    const standings = teamScores?.[key] ?? []
    const ours = standings.find((s) => s.ours)
    if (!ours) continue
    counters.push({
      page: "teamScores",
      label,
      value: teamPlaceLabel(ours, standings),
      hint: `${formatPoints(ours.points)} pts`,
      detail: teamScoreGap(standings) ?? undefined,
      place: ours.place,
    })
  }

  // Top scorers — individual swims only; relay points stay with the relay
  const scorers = new Map<string, { athleteName: string; sortName: string; points: number; swims: number }>()
  for (const s of meetSwims) {
    if (s.points == null || s.points <= 0 || isRelayLeadoffSwimTag(s.tags ?? "")) continue
    const prev = scorers.get(s.athleteId)
    if (prev) {
      prev.points += s.points
      prev.swims += 1
    } else {
      const athleteName = nameOf(s.athleteId, s.athleteName)
      scorers.set(s.athleteId, { athleteName, sortName: sortNameOf(s.athleteId, athleteName), points: s.points, swims: 1 })
    }
  }
  // Most points first; level on points, by last name.
  const ranked = [...scorers.values()].sort((a, b) => b.points - a.points || a.sortName.localeCompare(b.sortName))
  const topScorers = ranked.slice(0, 3)
  topScorers.forEach((scorer, i) => {
    counters.push({
      page: "topScorers",
      label: i === 0 ? "Top scorer" : `${formatOrdinal(i + 1)} scorer`,
      value: displayName(scorer.athleteName),
      hint: `${formatPoints(scorer.points)} pts · ${scorer.swims} ${scorer.swims === 1 ? "event" : "events"}`,
    })
  })
  // The exports' list: the top five, and anyone tied with fifth, ranked with ties sharing a place
  const fifth = ranked[TOP_SCORERS - 1]?.points
  const topScorerList: TopScorer[] = ranked
    .filter((scorer) => fifth == null || scorer.points >= fifth)
    .map((scorer) => ({
      rank: 1 + ranked.filter((other) => other.points > scorer.points).length,
      athleteName: displayName(scorer.athleteName),
      points: formatPoints(scorer.points),
      events: scorer.swims,
    }))

  // Swimmers who raced — a DQ or DNF counts, only a no-show or scratch in every event doesn't
  const swimmerIds = new Set<string>()
  for (const r of results) {
    if (r.isRelayLeadoff) continue
    if (racesSwum(r) > 0 || hasTimedResult(r) || preferredPlace(r) != null) {
      swimmerIds.add(r.athleteId)
    }
  }
  for (const relay of relayResults ?? []) {
    if (relay.entryType !== "relay_team" || racesSwum(relay) === 0) continue
    for (const leg of relay.relaySwimmers ?? []) {
      if (leg.athleteId) swimmerIds.add(leg.athleteId)
    }
  }
  for (const s of meetSwims) swimmerIds.add(s.athleteId)
  if (swimmerIds.size > 0) {
    counters.push({ label: countLabel(swimmerIds.size, "Swimmer", "Swimmers"), value: swimmerIds.size, row: "results" })
  }
  if (recordCount) {
    counters.push({ label: countLabel(recordCount, "GTSC Record", "GTSC Records"), value: recordCount, row: "results" })
  }

  // Wins / podiums / top 8s — at most one per athlete×event (prefer final place), and one per
  // relay team, as Top Performances counts them
  function countPlacedAtOrBetter(maxPlace: number): number {
    const keys = new Set<string>()
    for (const r of results) {
      if (r.isRelayLeadoff) continue
      const place = preferredPlace(r)
      if (place == null || place > maxPlace) continue
      keys.add(`${r.athleteId}|${normalizeEventName(r.event)}`)
    }
    for (const relay of relayResults ?? []) {
      if (relay.entryType !== "relay_team" || relay.relayRound === "P") continue
      const place = preferredPlace(relay)
      if (place == null || place > maxPlace) continue
      // Its gender from the sheet, else its swimmers, so women's and men's relays stay apart.
      const legs = relay.relaySwimmers ?? []
      const gender = relayGender(relay.gender, legs.map((leg) => (leg.athleteId ? genderById?.get(leg.athleteId) : undefined)))
      keys.add(`relay|${gender}|${normalizeEventName(relay.event)}|${relay.relayLetter ?? ""}`)
    }
    return keys.size
  }
  const wins = computeTopPerformances()
  const winCount = countPlacedAtOrBetter(1)
  if (winCount > 0) {
    counters.push({ label: countLabel(winCount, "Win", "Wins"), value: winCount, row: "results" })
  }
  const podiumCount = countPlacedAtOrBetter(3)
  if (podiumCount > 0) {
    counters.push({ label: countLabel(podiumCount, "Podium", "Podiums"), value: podiumCount, row: "results" })
  }
  const topEightCount = countPlacedAtOrBetter(8)
  if (topEightCount > 0) {
    counters.push({ label: countLabel(topEightCount, "Top 8 Finish", "Top 8 Finishes"), value: topEightCount, row: "results" })
  }

  // Personal bests set (including relay leadoffs)
  let pbCount = 0
  const pbCountsByAthlete = new Map<string, { athleteName: string; sortName: string; count: number }>()
  for (const s of meetSwims) {
    if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
    const best = pbMap.get(pbKey(s.athleteId, s.event, s.course))
    if (best == null || s.timeMs !== best) continue
    pbCount += 1
    const prev = pbCountsByAthlete.get(s.athleteId)
    if (prev) prev.count += 1
    else {
      const athleteName = nameOf(s.athleteId, s.athleteName)
      pbCountsByAthlete.set(s.athleteId, { athleteName, sortName: sortNameOf(s.athleteId, athleteName), count: 1 })
    }
  }
  if (pbCount > 0) {
    counters.push({ label: countLabel(pbCount, "Personal Best", "Personal Bests"), value: pbCount, row: "swims" })
  }

  // Season bests — each athlete × event's fastest swim here (prelims and finals count once), when
  // it's their first of the season in that event or beats every earlier one this season
  if (priorSeasonSwims) {
    const fastestHere = new Map<string, number>()
    for (const s of meetSwims) {
      if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
      const key = pbKey(s.athleteId, s.event, s.course)
      const prev = fastestHere.get(key)
      if (prev == null || s.timeMs < prev) fastestHere.set(key, s.timeMs)
    }
    const priorSeasonBest = buildAthletePbMap(priorSeasonSwims)
    let seasonBestCount = 0
    for (const [key, timeMs] of fastestHere) {
      const prior = priorSeasonBest.get(key)
      if (prior == null || timeMs < prior) seasonBestCount += 1
    }
    if (seasonBestCount > 0) {
      counters.push({
        label: countLabel(seasonBestCount, "Season Best", "Season Bests"),
        value: seasonBestCount,
        row: "swims",
      })
    }
  }

  // New Nationals cuts — first cuts of the season made here, at most one per athlete×event, relay
  // leadoffs excluded — counted and listed (the Results exports' sections)
  let newNationalsCuts: NewNationalsCut[] = []
  if (nationalsCuts?.length) {
    const cutMsByKey = new Map<string, number>()
    for (const cut of nationalsCuts) {
      cutMsByKey.set(
        `${cut.course}|${cut.gender}|${canonicalizeStrokeEvent(cut.event).toLowerCase()}`,
        cut.timeMs
      )
    }
    /** The cut a swim made, or null: individual events only, relay leadoffs excluded. */
    const cutMade = (swim: { event: string; course: string; timeMs: number; tags?: string }, gender: string) => {
      if (isRelayLeadoffSwimTag(swim.tags ?? "")) return null
      const event = canonicalizeStrokeEvent(swim.event).toLowerCase()
      if (!event || isRelaySignupEvent(event)) return null
      const cutMs = cutMsByKey.get(`${swim.course}|${gender}|${event}`)
      if (cutMs == null || swim.timeMs <= 0 || swim.timeMs > cutMs) return null
      return { key: `${swim.course}|${event}`, cutMs }
    }
    const genderByAthlete = new Map<string, string>()
    for (const s of meetSwims) if (s.gender) genderByAthlete.set(s.athleteId, s.gender)
    // Athlete × course × event cuts already made earlier this season.
    const priorCuts = new Set<string>()
    for (const s of priorSeasonSwims ?? []) {
      const gender = genderByAthlete.get(s.athleteId)
      const made = gender ? cutMade(s, gender) : null
      if (made) priorCuts.add(`${s.athleteId}|${made.key}`)
    }
    // Each athlete × event's fastest swim under a cut they hadn't made before this meet.
    const newCuts = new Map<string, { swim: MeetSwimForStats; cutMs: number }>()
    for (const s of meetSwims) {
      if (!s.gender) continue
      const made = cutMade(s, s.gender)
      if (!made) continue
      const key = `${s.athleteId}|${made.key}`
      if (priorCuts.has(key)) continue
      const prev = newCuts.get(key)
      if (!prev || s.timeMs < prev.swim.timeMs) newCuts.set(key, { swim: s, cutMs: made.cutMs })
    }
    if (newCuts.size > 0) {
      counters.push({ label: countLabel(newCuts.size, "New Nattys Cut", "New Nattys Cuts"), value: newCuts.size, row: "swims" })
    }
    newNationalsCuts = [...newCuts.values()]
      .map(({ swim, cutMs }) => ({
        athleteId: swim.athleteId,
        athleteName: nameOf(swim.athleteId, swim.athleteName),
        gender: swim.gender === "M" ? ("M" as const) : ("F" as const),
        event: canonicalizeStrokeEvent(swim.event),
        time: formatDisplayTime(formatTime(swim.timeMs)),
        cut: formatDisplayTime(formatTime(cutMs)),
        // At the cut is still under it: "-0.00", drawn as a drop.
        delta: swim.timeMs === cutMs ? "-0.00" : formatDeltaMs(swim.timeMs - cutMs),
      }))
      // Women then men, by last name, each athlete's cuts in event order.
      .sort(
        (a, b) =>
          (a.gender === b.gender ? 0 : a.gender === "F" ? -1 : 1) ||
          sortNameOf(a.athleteId, a.athleteName).localeCompare(sortNameOf(b.athleteId, b.athleteName)) ||
          compareSwimEvents(a.event, b.event)
      )
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
        athleteName: nameOf(r.athleteId, r.athleteName),
        event: r.event,
        deltaMs,
      }
    }
  }
  if (bestDrop) {
    const deltaStr = formatDeltaMs(bestDrop.deltaMs)
    counters.push({
      label: "Biggest drop",
      row: "swims",
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

  // Biggest PB drop — largest % drop vs. the athlete's best from before this meet
  let bestPbDrop: {
    athleteName: string
    event: string
    deltaMs: number
    pct: number
  } | null = null
  for (const s of meetSwims) {
    if (!Number.isFinite(s.timeMs) || s.timeMs <= 0) continue
    const prior = priorPbMap?.get(pbKey(s.athleteId, s.event, s.course))
    if (prior == null || prior <= 0) continue
    const deltaMs = s.timeMs - prior
    if (deltaMs >= 0) continue
    const pct = (-deltaMs / prior) * 100
    if (!bestPbDrop || pct > bestPbDrop.pct) {
      bestPbDrop = { athleteName: nameOf(s.athleteId, s.athleteName), event: s.event, deltaMs, pct }
    }
  }
  if (bestPbDrop) {
    counters.push({
      label: "Biggest PB drop",
      row: "swims",
      value: formatDropPct(bestPbDrop.pct),
      hint: `${displayName(bestPbDrop.athleteName)} · ${canonicalizeStrokeEvent(bestPbDrop.event)} · ${formatDeltaMs(bestPbDrop.deltaMs)}`,
    })
  }

  // Most PBs — only worth calling out with 2+; everyone tied for the most
  const mostPbs = leaders(pbCountsByAthlete.values())
  if (mostPbs && mostPbs.count > 1) {
    counters.push({
      label: "Most PBs",
      row: "swims",
      hintBesideLabel: true,
      value: mostPbs.names,
      hint: mostPbs.tied ? `${mostPbs.count} each` : `${mostPbs.count} PBs`,
    })
  }

  // Busiest swimmer — races swum (prelims and finals count twice), individual and relay legs
  const raceCountsByAthlete = new Map<
    string,
    { athleteName: string; sortName: string; count: number }
  >()
  function bumpBusy(athleteId: string, athleteName: string, races: number) {
    if (!athleteId || athleteId.startsWith("relay:")) return
    const prev = raceCountsByAthlete.get(athleteId)
    if (prev) prev.count += races
    else raceCountsByAthlete.set(athleteId, { athleteName, sortName: sortNameOf(athleteId, athleteName), count: races })
  }
  for (const r of results) {
    if (r.isRelayLeadoff) continue
    // A DQ is still a race; a manual swim with only a time is one.
    const races = racesSwum(r) || (hasTimedResult(r) ? 1 : 0)
    if (races > 0) bumpBusy(r.athleteId, nameOf(r.athleteId, r.athleteName), races)
  }
  for (const relay of relayResults ?? []) {
    if (relay.entryType !== "relay_team") continue
    // A relay carries one lineup, so its swimmers count each round it swam.
    const races = racesSwum(relay)
    if (races === 0) continue
    for (const leg of relay.relaySwimmers ?? []) {
      if (!leg.athleteId) continue
      bumpBusy(leg.athleteId, nameOf(leg.athleteId, leg.name || relay.athleteName), races)
    }
  }
  // Everyone tied for the most races
  const busiest = leaders(raceCountsByAthlete.values())
  if (busiest && busiest.count > 1) {
    counters.push({
      label: "Busiest",
      row: "swims",
      hintBesideLabel: true,
      value: busiest.names,
      hint: `${busiest.count} races${busiest.tied ? " each" : ""}`,
    })
  }

  if (counters.length === 0) return null
  return {
    counters,
    spotlight,
    teamScores: teamScores ?? null,
    newNationalsCuts,
    topScorers: topScorerList,
    wins,
  }
}
