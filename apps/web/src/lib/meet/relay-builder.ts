import type { RelayLineup } from "@swimbuzz/shared"
import { formatTime } from "@/lib/utils"
import { canonicalizeStrokeEvent, relaySignupKey } from "@/lib/swim/swim-parse"

// Pure relay builder lineup logic shared by the relays summary and the builder (client-safe).

export const FALLBACK_RELAY_EVENTS = [
  "200 Free Relay",
  "400 Free Relay",
  "800 Free Relay",
  "200 Medley Relay",
  "400 Medley Relay",
]

/** Swim time windows, widest first. `days: null` = all time. */
export const TIME_WINDOWS: { label: string; days: number | null }[] = [
  { label: "All time", days: null },
  { label: "Last 3 years", days: 1095 },
  { label: "Last 2 years", days: 730 },
  { label: "Last 1 year", days: 365 },
  { label: "Last 6 months", days: 180 },
]

/** Days in a window, with all time as unbounded — for "prefer is no wider than limit". */
export function windowDays(days: number | null): number {
  return days ?? Infinity
}

export const RELAY_LETTERS = ["A", "B", "C", "D"] as const

/** Default number of relays (A, B, …) for a fresh optimal lineup. */
export const DEFAULT_RELAY_COUNT = 2

export type RelayGenderCode = "M" | "F" | "X"

export type AthleteOption = {
  id: string
  name?: string
  gender?: "M" | "F"
}

export type SignupPool = "all" | "meet" | "relay"

export type Leg = {
  leg?: string
  name: string
  event: string
  /** null = no time on record (NT) until the coach enters one. */
  timeMs: number | null
  athleteId: string
  gender?: "M" | "F"
  sourceDate?: string | null
  outsideWindow?: boolean
  /** Coach-entered time rather than a swim on record. */
  custom?: boolean
}

export type RelayTeam = {
  letter: string
  /** null while any leg is NT. */
  totalMs: number | null
  legs: Leg[]
}

type StrokeTime = {
  timeMs: number
  event: string
  sourceDate?: string | null
  outsideWindow?: boolean
  custom?: boolean
}

export type StrokeTimes = Record<
  string,
  { name: string; gender?: "M" | "F"; times: Record<string, StrokeTime> }
>

export type RelayResult = {
  relay: string
  course: string
  teams: RelayTeam[]
  alternates?: Leg[]
  strokeTimes?: StrokeTimes
}

/** A lineup to keep (published, draft, or the coach's edits), re-timed from times on record. */
export type LineupTeam = {
  letter: string
  legs: { athleteId: string; name: string; timeMs?: number | null; custom?: boolean }[]
}

// --- Relay events (gender + event) ---------------------------------------------------------

/** Packet "4x50 Freestyle Relay" → "200 Free Relay". */
export function canonicalRelayEvent(event: string): string {
  // Strip "Mixed" first so "Mixed 4x50 Freestyle Relay" still canonicalizes to "200 Free Relay".
  return canonicalizeStrokeEvent(event.replace(/\bMixed\s+/gi, ""))
    .replace(/\s+/g, " ")
    .trim()
}

export function relayGenderLabel(gender: RelayGenderCode): string {
  return gender === "F" ? "Women" : gender === "M" ? "Men" : "Mixed"
}

/** One relay the team can enter: a gender + relay event. */
export type RelayEventSlot = {
  slug: string
  gender: RelayGenderCode
  /** Canonical event, e.g. "200 Medley Relay". */
  event: string
  /** "Women 200 Medley Relay". */
  label: string
}

export function relaySlotSlug(gender: RelayGenderCode, event: string): string {
  return `${relayGenderLabel(gender).toLowerCase()}-${relaySignupKey(event).replace(/[^a-z0-9]+/g, "-")}`
}

export function relaySlot(gender: RelayGenderCode, event: string): RelayEventSlot {
  const canonical = canonicalRelayEvent(event)
  return {
    slug: relaySlotSlug(gender, canonical),
    gender,
    event: canonical,
    label: `${relayGenderLabel(gender)} ${canonical}`,
  }
}

export function slotMatches(slot: Pick<RelayEventSlot, "gender" | "event">, gender: string, event: string) {
  return slot.gender === gender && relaySignupKey(slot.event) === relaySignupKey(canonicalRelayEvent(event))
}

const SLOT_GENDER_ORDER: RelayGenderCode[] = ["F", "M", "X"]

/**
 * Relay events for a meet — from the event order (Women/Men by event numbers, "Mixed" by name),
 * plus anything already published or drafted. Women, Men, Mixed; meet order within each.
 */
export function relayEventSlots(
  eventOrder: { event: string; women: number | null; men: number | null }[],
  extra: { gender: string; event: string }[]
): RelayEventSlot[] {
  const slots: RelayEventSlot[] = []
  const add = (gender: string, event: string) => {
    if (gender !== "M" && gender !== "F" && gender !== "X") return
    if (slots.some((s) => slotMatches(s, gender, event))) return
    slots.push(relaySlot(gender, event))
  }
  for (const row of eventOrder) {
    if (/\bmixed\b/i.test(row.event)) {
      add("X", row.event)
      continue
    }
    if (row.women != null || row.men == null) add("F", row.event)
    if (row.men != null || row.women == null) add("M", row.event)
  }
  for (const item of extra) add(item.gender, item.event)
  return SLOT_GENDER_ORDER.flatMap((gender) => slots.filter((s) => s.gender === gender))
}

// --- Athlete pool --------------------------------------------------------------------------

/** Whether a sign-up relay preference ("200 Freestyle Mixed Relay") covers this builder relay. */
export function relayPreferenceMatches(pref: string, event: string, gender: string): boolean {
  if (relaySignupKey(pref) !== relaySignupKey(event)) return false
  return /\bmixed\b/i.test(pref) === (gender === "X")
}

/** Athletes of the relay's gender in the chosen sign-up pool. */
export function poolAthletesFor(
  athletes: AthleteOption[],
  gender: string,
  event: string,
  signupPool: SignupPool,
  signupRelayPrefs: Record<string, string[]> | null
): AthleteOption[] {
  return athletes.filter((a) => {
    if (gender === "X" ? a.gender !== "M" && a.gender !== "F" : a.gender !== gender) return false
    if (signupPool === "all" || !signupRelayPrefs) return true
    const prefs = signupRelayPrefs[a.id]
    if (!prefs) return false
    if (signupPool === "meet") return true
    return prefs.some((pref) => relayPreferenceMatches(pref, event, gender))
  })
}

// --- Optimal lineups -----------------------------------------------------------------------

export function normalizeResult(data: {
  relay: string
  course: string
  teams?: RelayTeam[]
  totalMs?: number
  legs?: Leg[]
  alternates?: Leg[]
  strokeTimes?: StrokeTimes
}): RelayResult {
  const teams =
    Array.isArray(data.teams) && data.teams.length > 0
      ? data.teams
      : data.legs
        ? [{ letter: "A", totalMs: data.totalMs ?? 0, legs: data.legs }]
        : []
  return {
    relay: data.relay,
    course: data.course,
    teams,
    alternates: data.alternates ? rankAlternates(data.alternates) : data.alternates,
    strokeTimes: data.strokeTimes,
  }
}

export async function fetchOptimalRelay(
  params: {
    meetId: string
    event: string
    course: string
    gender: string
    relayCount: number
    withinDays?: number | null
    limitDays?: number | null
    athleteIds?: string[] | null
  },
  signal?: AbortSignal
): Promise<{ ok: true; result: RelayResult } | { ok: false; error: string }> {
  const res = await fetch("/api/relays/optimal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      meetId: params.meetId,
      relayEvent: params.event,
      course: params.course,
      gender: params.gender,
      relayCount: params.relayCount,
      withinDays: params.withinDays ?? null,
      limitDays: params.limitDays ?? null,
      ...(params.athleteIds ? { athleteIds: params.athleteIds } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong" }
  return { ok: true, result: normalizeResult(data) }
}

// --- Legs ----------------------------------------------------------------------------------

const MEDLEY_SLOT_STROKES = ["back", "breast", "fly", "free"] as const

export function isMedleyRelay(relay: string): boolean {
  return /\bmedley\b/i.test(relay)
}

export function slotStroke(index: number): string {
  return MEDLEY_SLOT_STROKES[index] ?? "free"
}

/** strokeTimes key for a relay slot: the medley stroke, or "free". */
export function legStroke(relay: string, index: number): string {
  return isMedleyRelay(relay) ? slotStroke(index) : "free"
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

/** Individual event swum on a relay leg: "200 Medley Relay" leg 2 → "50 Breast". */
export function legEventName(relay: string, index: number): string {
  return `${parseInt(relay, 10) / 4} ${capitalize(legStroke(relay, index))}`
}

/** Alternate groups for a medley relay: "50 Back", "50 Breast", … */
export function medleyStrokeGroups(relay: string): { stroke: string; label: string }[] {
  const dist = parseInt(relay, 10) / 4
  return MEDLEY_SLOT_STROKES.map((stroke) => ({ stroke, label: `${dist} ${capitalize(stroke)}` }))
}

export function formatLegTime(timeMs: number | null): string {
  return timeMs == null ? "NT" : formatTime(timeMs)
}

function applyStroke(person: Pick<Leg, "athleteId" | "name" | "gender">, stroke: string, strokeTimes: StrokeTimes): Leg | null {
  const data = strokeTimes[person.athleteId]
  const time = data?.times[stroke]
  if (!time) return null
  return {
    athleteId: person.athleteId,
    name: data.name || person.name,
    gender: data.gender ?? person.gender,
    event: time.event,
    timeMs: time.timeMs,
    sourceDate: time.sourceDate ?? null,
    outsideWindow: time.outsideWindow ?? false,
    custom: time.custom ?? false,
    leg: stroke,
  }
}

function rebuildMedleyAlternates(strokeTimes: StrokeTimes, usedIds: Set<string>, mixed = false): Leg[] {
  const alts: Leg[] = []
  for (const stroke of MEDLEY_SLOT_STROKES) {
    const rows = Object.entries(strokeTimes)
      .filter(([id, data]) => !usedIds.has(id) && data.times[stroke])
      .map(([id, data]) => {
        const time = data.times[stroke]
        return {
          athleteId: id,
          name: data.name,
          event: time.event,
          gender: data.gender,
          timeMs: time.timeMs,
          sourceDate: time.sourceDate ?? null,
          outsideWindow: time.outsideWindow ?? false,
          custom: time.custom ?? false,
          leg: stroke,
        }
      })
      .sort((a, b) => a.timeMs - b.timeMs)
    const alternates = mixed
      ? [
          ...rows.filter((row) => row.gender === "M").slice(0, 1),
          ...rows.filter((row) => row.gender === "F").slice(0, 1),
        ]
      : rows.slice(0, 2)
    alts.push(...alternates)
  }
  return alts
}

/** Fastest unused free swimmers, like the optimal builder's free-relay alternates. */
function rebuildFreeAlternates(strokeTimes: StrokeTimes, usedIds: Set<string>): Leg[] {
  return Object.entries(strokeTimes)
    .filter(([id, data]) => !usedIds.has(id) && data.times.free)
    .map(([id, data]) => {
      const time = data.times.free
      return {
        athleteId: id,
        name: data.name,
        event: time.event,
        gender: data.gender,
        timeMs: time.timeMs,
        sourceDate: time.sourceDate ?? null,
        outsideWindow: time.outsideWindow ?? false,
        custom: time.custom ?? false,
      }
    })
    .sort((a, b) => a.timeMs - b.timeMs)
    .slice(0, 8)
}

function rebuildAlternates(result: RelayResult, teams: RelayTeam[], mixed: boolean): Leg[] {
  const usedIds = new Set(teams.flatMap((team) => team.legs.map((leg) => leg.athleteId)))
  const strokeTimes = result.strokeTimes ?? {}
  return rankAlternates(
    isMedleyRelay(result.relay)
      ? rebuildMedleyAlternates(strokeTimes, usedIds, mixed)
      : rebuildFreeAlternates(strokeTimes, usedIds)
  )
}

const PUBLISHED_ROUND_RANK: Record<RelayLineup["round"], number> = { "": 0, F: 1, P: 2 }

/** Published lineups for this relay event, one per letter (finals over prelims). */
export function publishedTeamsFor(published: RelayLineup[], event: string, gender: string): LineupTeam[] {
  const key = relaySignupKey(canonicalRelayEvent(event))
  const byLetter = new Map<string, RelayLineup>()
  for (const relay of published) {
    if (relay.gender !== gender) continue
    if (relaySignupKey(canonicalRelayEvent(relay.event)) !== key) continue
    if (relay.legs.length !== 4 || relay.legs.some((leg) => !leg.athleteId)) continue
    const current = byLetter.get(relay.letter)
    if (!current || PUBLISHED_ROUND_RANK[relay.round] < PUBLISHED_ROUND_RANK[current.round]) {
      byLetter.set(relay.letter, relay)
    }
  }
  return [...byLetter.values()]
    .sort((a, b) => a.letter.localeCompare(b.letter))
    .map((relay) => ({
      letter: relay.letter,
      legs: relay.legs.map((leg) => ({ athleteId: leg.athleteId as string, name: leg.name })),
    }))
}

/** The lineup currently on screen, as teams to keep across a rebuild. */
export function lineupTeamsOf(result: RelayResult): LineupTeam[] {
  return result.teams.map((team) => ({
    letter: team.letter,
    legs: team.legs.map((leg) => ({
      athleteId: leg.athleteId,
      name: leg.name,
      timeMs: leg.timeMs,
      custom: leg.custom,
    })),
  }))
}

/** Who swims which leg (plus custom times) — what "changed since it was loaded" compares. */
export function lineupKey(teams: LineupTeam[]): string {
  return teams
    .map((team) =>
      `${team.letter}:` +
      team.legs.map((leg) => (leg.custom ? `${leg.athleteId}@${leg.timeMs}` : leg.athleteId)).join(",")
    )
    .join("|")
}

/** Swap the optimal teams for a fixed lineup, timing each leg from times on record. */
export function applyLineupTeams(
  base: RelayResult,
  lineup: LineupTeam[],
  genders: Map<string, "M" | "F" | undefined>,
  mixed: boolean
): RelayResult {
  let next: RelayResult = {
    ...base,
    teams: lineup.map((team) => ({
      letter: team.letter,
      totalMs: null,
      legs: team.legs.map((leg, i) =>
        legFor(base, { athleteId: leg.athleteId, name: leg.name, gender: genders.get(leg.athleteId) }, i)
      ),
    })),
  }
  for (const team of lineup) {
    team.legs.forEach((leg, i) => {
      if (leg.custom && leg.timeMs != null) next = setLegTime(next, team.letter, i, leg.timeMs)
    })
  }
  const teams = retotalTeams(next.teams)
  return { ...next, teams, alternates: rebuildAlternates(next, teams, mixed) }
}

/** Keep the first `count` relays; swimmers on dropped relays become alternates again. */
export function truncateTeams(result: RelayResult, count: number, mixed: boolean): RelayResult {
  const teams = result.teams.slice(0, count)
  return { ...result, teams, alternates: rebuildAlternates(result, teams, mixed) }
}

/**
 * Add relays built from swimmers not already on a relay, keeping the existing relays as they
 * are. `extra` is an optimal result for the unused swimmers; its teams are re-lettered after
 * the current ones.
 */
export function appendTeams(result: RelayResult, extra: RelayResult, mixed: boolean): RelayResult {
  const used = new Set(result.teams.flatMap((team) => team.legs.map((leg) => leg.athleteId)))
  const added = extra.teams
    .filter((team) => team.legs.every((leg) => !used.has(leg.athleteId)))
    .slice(0, RELAY_LETTERS.length - result.teams.length)
    .map((team, i) => ({ ...team, letter: RELAY_LETTERS[result.teams.length + i] }))
  const merged: RelayResult = {
    ...result,
    // Current times win so coach-entered custom times survive.
    strokeTimes: { ...extra.strokeTimes, ...result.strokeTimes },
    teams: [...result.teams, ...added],
  }
  return { ...merged, alternates: rebuildAlternates(merged, merged.teams, mixed) }
}

export type RowLoc =
  | { list: "team"; letter: string; index: number }
  | { list: "alt"; index: number }

export function locKey(loc: RowLoc): string {
  return loc.list === "team" ? `team:${loc.letter}:${loc.index}` : `alt:${loc.index}`
}

function sameLoc(a: RowLoc, b: RowLoc): boolean {
  if (a.list !== b.list) return false
  if (a.list === "alt" && b.list === "alt") return a.index === b.index
  return a.list === "team" && b.list === "team" && a.letter === b.letter && a.index === b.index
}

function retotalTeams(teams: RelayTeam[]): RelayTeam[] {
  return teams.map((team) => ({
    ...team,
    totalMs: team.legs.every((leg) => leg.timeMs != null)
      ? team.legs.reduce((sum, leg) => sum + (leg.timeMs ?? 0), 0)
      : null,
  }))
}

/** Medley stroke an alternate row belongs to ("back", …), or null for free relays. */
export function alternateStroke(row: Leg): string | null {
  const fromLeg = row.leg?.toLowerCase()
  if (fromLeg && (MEDLEY_SLOT_STROKES as readonly string[]).includes(fromLeg)) return fromLeg
  const event = row.event.toLowerCase()
  return MEDLEY_SLOT_STROKES.find((stroke) => event.includes(stroke)) ?? null
}

function rankAlternates(alts: Leg[]): Leg[] {
  const strokeIndex = (row: Leg) => {
    const stroke = alternateStroke(row)
    return stroke ? MEDLEY_SLOT_STROKES.indexOf(stroke as (typeof MEDLEY_SLOT_STROKES)[number]) : 99
  }
  return [...alts].sort((a, b) => {
    const strokeDiff = strokeIndex(a) - strokeIndex(b)
    if (strokeDiff !== 0) return strokeDiff
    return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || 0
  })
}

function legAt(result: RelayResult, loc: RowLoc): Leg | null {
  if (loc.list === "alt") return result.alternates?.[loc.index] ?? null
  return result.teams.find((team) => team.letter === loc.letter)?.legs[loc.index] ?? null
}

function athleteIdAt(result: RelayResult, loc: RowLoc): string | null {
  return legAt(result, loc)?.athleteId ?? null
}

function hasValidMixedComposition(legs: Leg[]): boolean {
  if (legs.length !== 4) return false
  const men = legs.filter((leg) => leg.gender === "M").length
  const women = legs.filter((leg) => leg.gender === "F").length
  return men === 2 && women === 2
}

function preservesMixedComposition(result: RelayResult, from: RowLoc, to: RowLoc): boolean {
  if (to.list === "alt") return false
  if (from.list === "team" && from.letter === to.letter) return true
  const incoming = legAt(result, from)
  const targetTeam = result.teams.find((team) => team.letter === to.letter)
  if (!incoming || !targetTeam || to.index < 0 || to.index >= targetTeam.legs.length) return false
  const targetLegs = [...targetTeam.legs]
  const outgoing = targetLegs[to.index]
  targetLegs[to.index] = incoming
  if (!hasValidMixedComposition(targetLegs)) return false
  if (from.list !== "team") return true
  const sourceTeam = result.teams.find((team) => team.letter === from.letter)
  if (!sourceTeam || from.index < 0 || from.index >= sourceTeam.legs.length) return false
  const sourceLegs = [...sourceTeam.legs]
  sourceLegs[from.index] = outgoing
  return hasValidMixedComposition(sourceLegs)
}

export function canDropOnSlot(result: RelayResult, from: RowLoc, to: RowLoc, mixed = false): boolean {
  // Dropping a relay swimmer on an alternate is the same swap as the reverse drag.
  if (to.list === "alt") return from.list === "team" && canDropOnSlot(result, to, from, mixed)
  if (sameLoc(from, to)) return false
  if (mixed && !preservesMixedComposition(result, from, to)) return false
  if (!isMedleyRelay(result.relay) || !result.strokeTimes) return true
  const incomingId = athleteIdAt(result, from)
  if (!incomingId) return false
  if (!result.strokeTimes[incomingId]?.times[slotStroke(to.index)]) return false
  if (from.list === "team") {
    const outgoingId = athleteIdAt(result, to)
    if (!outgoingId) return false
    if (!result.strokeTimes[outgoingId]?.times[slotStroke(from.index)]) return false
  }
  return true
}

export function moveRelayRow(result: RelayResult, from: RowLoc, to: RowLoc, mixed = false): RelayResult {
  if (sameLoc(from, to)) return result
  if (from.list === "alt" && to.list === "alt") return result
  if (to.list === "alt") return moveRelayRow(result, to, from, mixed)
  if (mixed && !preservesMixedComposition(result, from, to)) return result

  const teams = result.teams.map((team) => ({ ...team, legs: [...team.legs] }))
  const alts = [...(result.alternates ?? [])]
  const listFor = (loc: RowLoc): Leg[] => {
    if (loc.list === "alt") return alts
    return teams.find((team) => team.letter === loc.letter)?.legs ?? []
  }

  const fromList = listFor(from)
  const toList = listFor(to)
  if (from.index < 0 || from.index >= fromList.length) return result
  if (to.index < 0 || to.index >= toList.length) return result

  const strokeTimes = result.strokeTimes
  const medley = isMedleyRelay(result.relay) && strokeTimes

  if (medley) {
    const incoming = applyStroke(fromList[from.index], slotStroke(to.index), strokeTimes)
    if (!incoming) return result
    if (from.list === "team") {
      const displaced = applyStroke(toList[to.index], slotStroke(from.index), strokeTimes)
      if (!displaced) return result
      toList[to.index] = incoming
      fromList[from.index] = displaced
    } else {
      toList[to.index] = incoming
    }
    const usedIds = new Set(
      teams.flatMap((team) => team.legs.map((leg) => leg.athleteId))
    )
    return {
      ...result,
      teams: retotalTeams(teams),
      alternates: rankAlternates(rebuildMedleyAlternates(strokeTimes, usedIds, mixed)),
    }
  }

  if (fromList === toList) {
    const [item] = fromList.splice(from.index, 1)
    fromList.splice(to.index, 0, item)
  } else {
    const swapped = fromList[from.index]
    fromList[from.index] = toList[to.index]
    toList[to.index] = swapped
  }

  return {
    ...result,
    teams: retotalTeams(teams),
    alternates: rankAlternates(alts),
  }
}

type LegAthlete = Pick<Leg, "athleteId" | "name" | "gender">

/** A leg for this athlete in this slot, using their time on record (or custom time), else NT. */
function legFor(result: RelayResult, person: LegAthlete, index: number): Leg {
  const stroke = legStroke(result.relay, index)
  const data = result.strokeTimes?.[person.athleteId]
  const time = data?.times[stroke]
  return {
    athleteId: person.athleteId,
    name: person.name || data?.name || "Unknown",
    gender: person.gender ?? data?.gender,
    event: time?.event ?? legEventName(result.relay, index),
    timeMs: time?.timeMs ?? null,
    sourceDate: time?.sourceDate ?? null,
    outsideWindow: time?.outsideWindow ?? false,
    custom: time?.custom ?? false,
    ...(isMedleyRelay(result.relay) ? { leg: stroke } : {}),
  }
}

/**
 * Puts `person` on a relay leg. If they already swim another leg the two swap;
 * otherwise the swimmer being replaced moves to the alternates.
 */
export function replaceLeg(result: RelayResult, letter: string, index: number, person: LegAthlete): RelayResult {
  const teams = result.teams.map((team) => ({ ...team, legs: [...team.legs] }))
  const team = teams.find((t) => t.letter === letter)
  const outgoing = team?.legs[index]
  if (!team || !outgoing || outgoing.athleteId === person.athleteId) return result

  let swapFrom: { legs: Leg[]; index: number } | null = null
  for (const t of teams) {
    const i = t.legs.findIndex((leg) => leg.athleteId === person.athleteId)
    if (i >= 0) swapFrom = { legs: t.legs, index: i }
  }

  team.legs[index] = legFor(result, person, index)
  let alternates = result.alternates ?? []
  if (swapFrom) {
    swapFrom.legs[swapFrom.index] = legFor(result, outgoing, swapFrom.index)
  } else {
    alternates = rankAlternates([
      ...alternates.filter((alt) => alt.athleteId !== person.athleteId),
      outgoing,
    ])
  }
  return { ...result, teams: retotalTeams(teams), alternates }
}

/** Sets a coach-entered time on a relay leg; remembered for this athlete and stroke. */
export function setLegTime(result: RelayResult, letter: string, index: number, timeMs: number): RelayResult {
  const teams = result.teams.map((team) => ({ ...team, legs: [...team.legs] }))
  const team = teams.find((t) => t.letter === letter)
  const leg = team?.legs[index]
  if (!team || !leg) return result

  const stroke = legStroke(result.relay, index)
  team.legs[index] = { ...leg, timeMs, sourceDate: null, outsideWindow: false, custom: true }
  const prior = result.strokeTimes?.[leg.athleteId]
  return {
    ...result,
    teams: retotalTeams(teams),
    strokeTimes: {
      ...result.strokeTimes,
      [leg.athleteId]: {
        name: prior?.name ?? leg.name,
        gender: prior?.gender ?? leg.gender,
        times: {
          ...prior?.times,
          [stroke]: { timeMs, event: leg.event, sourceDate: null, outsideWindow: false, custom: true },
        },
      },
    },
  }
}

/** A relay event with its published lineups and saved draft, as the relays page loads it. */
export type RelaySlotData = {
  slot: RelayEventSlot
  published: RelayLineup[]
  draft: { teams: LineupTeam[]; savedAt: string } | null
}

/** What the builder opens on for a relay event: its draft, else what's published, else optimal. */
export function initialLineup(data: RelaySlotData): {
  source: "draft" | "published" | "optimal"
  fixed: LineupTeam[] | null
} {
  if (data.draft) return { source: "draft", fixed: data.draft.teams }
  const published = publishedTeamsFor(data.published, data.slot.event, data.slot.gender)
  if (published.length > 0) return { source: "published", fixed: published }
  return { source: "optimal", fixed: null }
}

/**
 * Athletes to time for a build: the pool (null = everyone eligible, when it isn't narrowed),
 * plus a kept lineup's swimmers so they stay timed even outside the pool.
 */
export function buildAthleteIds(
  pool: AthleteOption[],
  narrowed: boolean,
  fixed: LineupTeam[] | null
): string[] | null {
  if (!narrowed) return null
  return [...new Set([...pool.map((a) => a.id), ...(fixed ?? []).flatMap((t) => t.legs.map((l) => l.athleteId))])]
}
