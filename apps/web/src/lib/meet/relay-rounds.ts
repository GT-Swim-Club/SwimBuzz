import { isEventOrder } from "@/lib/meet/meet-event-order"
import { isSheetSummary, sheetEntryHasResultData, type SheetEntry } from "@/lib/meet/meet-sheet-summary"
import { relayDraftsOf } from "@/lib/meet/relay-drafts"
import {
  effectiveRelayGender,
  effectiveRelayRound,
  isRelayResultsSummary,
  relayEventKey,
  type RelayGender,
  type RelayRound,
} from "@/lib/meet/relay-results"

// Prelims / finals relay lineups (client-safe).
//
// Stored shape (Meet.relayResultsSummary, builder lineups = `manual` relay_team rows without results):
// - relayRound "" — the event's one lineup: the only one at a timed-finals meet, and at a meet with
//   a finals session the prelims lineup that finals follows. Every lineup saved before rounds
//   existed is this, so it keeps reading as the prelims/only lineup.
// - relayRound "P" + "F" — written once a coach makes finals its own lineup (or once results are in
//   and a round has to be published on its own). Results imports replace them by round, since an
//   imported team's key (event|letter|round|gender) matches the builder row of the same round.

/** Session labels that mean the meet swims prelims and finals ("Day 1 Prelims", "Finals"), not "Timed Finals". */
function isRoundSessionLabel(label: string): boolean {
  if (/\bprelim/i.test(label)) return true
  return /\bfinals?\b/i.test(label) && !/\btimed\s+finals?\b/i.test(label)
}

export type FinalsSessionMeetFields = {
  eventOrder: unknown
  finalsHeatSheetSummary: unknown
  relayResultsSummary: unknown
  relayDrafts?: unknown
  relayPrelimsFinals?: unknown
}

/**
 * Whether the meet has a finals session: a finals heat sheet is imported, the event order has a
 * prelims or finals session, relay results or saved lineups are already split by round, a draft
 * has its own finals lineup, or a coach made a relay prelims & finals. Which relays swim prelims
 * and finals is per event (relayEventRounds); this gates publishing once results are in.
 */
export function meetHasFinalsSession(meet: FinalsSessionMeetFields): boolean {
  if (isSheetSummary(meet.finalsHeatSheetSummary) && meet.finalsHeatSheetSummary.entries.length > 0) {
    return true
  }
  if (isEventOrder(meet.eventOrder) && meet.eventOrder.sessions.some((s) => isRoundSessionLabel(s.label))) {
    return true
  }
  if (
    isRelayResultsSummary(meet.relayResultsSummary) &&
    meet.relayResultsSummary.entries.some((e) => effectiveRelayRound(e) !== "")
  ) {
    return true
  }
  if (Object.values(relayPrelimsFinalsOf(meet.relayPrelimsFinals)).some(Boolean)) return true
  return relayDraftsOf(meet.relayDrafts).some((draft) => Boolean(draft.finalsTeams?.length))
}

/** Same relay event and gender (any letter or round). */
export function isSameRelayEvent(
  entry: SheetEntry,
  event: string,
  gender: RelayGender,
  athleteGenders?: Map<string, RelayGender>
): boolean {
  return (
    entry.entryType === "relay_team" &&
    relayEventKey(entry.event) === relayEventKey(event) &&
    effectiveRelayGender(entry, athleteGenders) === gender
  )
}

/**
 * Whether results are in for this relay event's round ("" = any round). A timed-final result
 * (no round) counts for both rounds.
 */
export function relayRoundHasResults(
  entries: SheetEntry[],
  event: string,
  gender: RelayGender,
  round: RelayRound,
  athleteGenders?: Map<string, RelayGender>
): boolean {
  return entries.some((entry) => {
    if (!isSameRelayEvent(entry, event, gender, athleteGenders) || !sheetEntryHasResultData(entry)) return false
    const entryRound = effectiveRelayRound(entry)
    return round === "" || entryRound === "" || entryRound === round
  })
}

/** A relay lineup the builder published (not imported, no results yet) for this event and gender. */
export function isBuilderRelayLineup(
  entry: SheetEntry,
  event: string,
  gender: RelayGender,
  athleteGenders?: Map<string, RelayGender>
): boolean {
  return entry.manual === true && !sheetEntryHasResultData(entry) && isSameRelayEvent(entry, event, gender, athleteGenders)
}

// Per-event "Prelims & finals" (client-safe).
//
// Some relays at a prelims/finals meet are timed finals, so whether a relay event gets a prelims
// and a finals lineup is decided per event: results decide (and lock it); else a coach's choice in
// the builder (Meet.relayPrelimsFinals); else the meet's evidence for that event. Women's and Men's
// of an event share it; a mixed relay is its own event.

/** Why the toggle can't change: results are split by round ("rounds") or are a timed final ("timed"). */
export type RelayRoundsLock = "rounds" | "timed"

export type RelayEventRounds = {
  /** The relay event swims prelims and finals. */
  on: boolean
  locked: RelayRoundsLock | null
}

/** Key of a relay event's choice: Women's and Men's share one; mixed is "X|<event>". */
export function relayRoundsKey(event: string, gender: string): string {
  const key = relayEventKey(event)
  return gender === "X" ? `X|${key}` : key
}

/** Coach choices by `relayRoundsKey` from Meet.relayPrelimsFinals. */
export function relayPrelimsFinalsOf(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {}
  const events = (raw as { events?: unknown }).events
  if (!events || typeof events !== "object") return {}
  return Object.fromEntries(
    Object.entries(events as Record<string, unknown>).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")
  )
}

/** The genders sharing a relay event's choice. */
function sharedGenders(gender: string): RelayGender[] {
  return gender === "X" ? ["X"] : ["F", "M"]
}

export type RelayEventRoundsMeetFields = {
  finalsHeatSheetSummary: unknown
  relayResultsSummary: unknown
  relayDrafts?: unknown
  relayPrelimsFinals?: unknown
}

/**
 * Whether a relay event swims prelims and finals. Results lock it (a P/F result on, a timed-final
 * result off); else the coach's choice; else on when the event is on the finals heat sheet, its
 * relays (published or from sheets) are split by round, or a draft has its own finals lineup.
 */
export function relayEventRounds(
  meet: RelayEventRoundsMeetFields,
  event: string,
  gender: string,
  athleteGenders?: Map<string, RelayGender>
): RelayEventRounds {
  const genders = sharedGenders(gender)
  const ofEvent = (entry: SheetEntry) => genders.some((g) => isSameRelayEvent(entry, event, g, athleteGenders))
  const relays = isRelayResultsSummary(meet.relayResultsSummary) ? meet.relayResultsSummary.entries.filter(ofEvent) : []

  const swum = relays.filter(sheetEntryHasResultData)
  if (swum.some((entry) => effectiveRelayRound(entry) !== "")) return { on: true, locked: "rounds" }
  if (swum.length > 0) return { on: false, locked: "timed" }

  const choice = relayPrelimsFinalsOf(meet.relayPrelimsFinals)[relayRoundsKey(event, gender)]
  if (choice != null) return { on: choice, locked: null }

  const onFinalsSheet =
    isSheetSummary(meet.finalsHeatSheetSummary) && meet.finalsHeatSheetSummary.entries.some(ofEvent)
  const splitRelays = relays.some((entry) => effectiveRelayRound(entry) !== "")
  const key = relayEventKey(event)
  const ownFinalsDraft = relayDraftsOf(meet.relayDrafts).some(
    (draft) =>
      Boolean(draft.finalsTeams?.length) &&
      relayEventKey(draft.event) === key &&
      genders.includes(draft.gender)
  )
  return { on: onFinalsSheet || splitRelays || ownFinalsDraft, locked: null }
}
