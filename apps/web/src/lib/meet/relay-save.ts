import type { RelayLineup } from "@swimbuzz/shared"
import { formatLegTime, lineupKey, type BuildSettings, type LineupTeam } from "@/lib/meet/relay-builder"
import { RELAY_EDIT_LOCK_TOKEN_HEADER } from "@/lib/meet/relay-edit-lock-shared"
import type { RelayRoundsLock } from "@/lib/meet/relay-rounds"

/** A lineup the coach saved from the relay builder, to persist after leaving it. */
export type RelayCommit = {
  kind: "draft" | "publish"
  /** The prelims lineup for a prelims & finals relay, else the event's only lineup. */
  teams: LineupTeam[]
  /** Finals' own lineup; null/absent = finals follows `teams`. */
  finalsTeams?: LineupTeam[] | null
  /** The build's relay name, used for published relays. */
  relayEvent: string
  /** The draft matches the optimal lineup (drafts only). */
  optimal?: boolean
  /** The builder settings in use, saved with the lineup. */
  settings?: BuildSettings
  /**
   * The coach turned "Prelims & finals" on or off for the event (shared by Women's and Men's);
   * absent when unchanged. Turning it off also drops the other gender's own finals lineup.
   */
  prelimsFinals?: boolean
}

/** How a relay event's rounds publish. */
export type RelayRoundsInfo = {
  /**
   * The meet has a finals session (meetHasFinalsSession): a round with no results yet can still be
   * published after other results are in.
   */
  finalsSession: boolean
  /** This relay event swims prelims and finals, so it gets a lineup per round (relayEventRounds). */
  prelimsFinals: boolean
  /** Results fix `prelimsFinals`: split by round ("rounds") or a timed final ("timed"). */
  locked: RelayRoundsLock | null
  /** Results are in for the round (relayRoundSwum); it can't be published. */
  swum: { P: boolean; F: boolean }
}

export const NO_ROUNDS: RelayRoundsInfo = {
  finalsSession: false,
  prelimsFinals: false,
  locked: null,
  swum: { P: false, F: false },
}

type RelayTarget = {
  meetId: string
  /** Slot event, e.g. "200 Medley Relay" (drafts are keyed by it). */
  event: string
  /** The build's relay name, used for published relays. */
  relayEvent: string
  gender: string
  /** What was published when the builder opened. */
  published: RelayLineup[]
  rounds: RelayRoundsInfo
  /** A "Prelims & finals" change to save with the lineup (RelayCommit.prelimsFinals). */
  prelimsFinals?: boolean
  /** The builder session's edit lock token; the server rejects writes without it while locked. */
  lockToken?: string | null
}

function lockHeaders(target: Pick<RelayTarget, "lockToken">, extra?: Record<string, string>): Record<string, string> {
  return { ...extra, ...(target.lockToken ? { [RELAY_EDIT_LOCK_TOKEN_HEADER]: target.lockToken } : {}) }
}

async function errorOf(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  return typeof body.error === "string" ? body.error : fallback
}

/** Sum of the leg times, or null if any leg has none. */
export function lineupTeamTotal(team: LineupTeam): number | null {
  const times = team.legs.map((leg) => leg.timeMs ?? null)
  return times.every((t) => t != null) ? (times as number[]).reduce((sum, t) => sum + t, 0) : null
}

/** Finals' lineup when it differs from prelims; null when it follows (or matches) them. */
export function independentFinals(teams: LineupTeam[], finalsTeams: LineupTeam[] | null | undefined): LineupTeam[] | null {
  return finalsTeams && lineupKey(finalsTeams) !== lineupKey(teams) ? finalsTeams : null
}

/**
 * The relays a publish leaves for the event: one round-less lineup while finals follows prelims
 * (and nothing is swum yet), else a prelims and a finals lineup — skipping a round whose results
 * are in. A timed-final relay always gets the round-less lineup.
 */
export function publishRows(
  rounds: RelayRoundsInfo,
  teams: LineupTeam[],
  finalsTeams: LineupTeam[] | null | undefined
): { round: "" | "P" | "F"; team: LineupTeam }[] {
  if (!rounds.prelimsFinals) return teams.map((team) => ({ round: "" as const, team }))
  const finals = independentFinals(teams, finalsTeams)
  if (!finals && !rounds.swum.P && !rounds.swum.F) {
    return teams.map((team) => ({ round: "" as const, team }))
  }
  return [
    ...(rounds.swum.P ? [] : teams.map((team) => ({ round: "P" as const, team }))),
    ...(rounds.swum.F ? [] : (finals ?? teams).map((team) => ({ round: "F" as const, team }))),
  ]
}

function lineupLegsBody(teams: LineupTeam[]) {
  return teams.map((team) => ({
    letter: team.letter,
    legs: team.legs.map((leg) => ({
      athleteId: leg.athleteId,
      timeMs: leg.timeMs ?? null,
      ...(leg.custom ? { custom: true } : {}),
    })),
  }))
}

/** Store the event's draft (`published`: the lineup just published, kept for its settings). */
async function putDraft(
  target: RelayTarget,
  teams: LineupTeam[],
  opts: { finalsTeams?: LineupTeam[] | null; optimal?: boolean; settings?: BuildSettings; published?: boolean }
): Promise<Response> {
  const finals = independentFinals(teams, opts.finalsTeams)
  return fetch(`/api/meets/${target.meetId}/relays/drafts`, {
    method: "PUT",
    headers: lockHeaders(target, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      event: target.event,
      gender: target.gender,
      optimal: opts.optimal === true,
      published: opts.published === true,
      settings: opts.settings ?? null,
      teams: lineupLegsBody(teams),
      finalsTeams: finals ? lineupLegsBody(finals) : null,
      ...(target.prelimsFinals != null ? { prelimsFinals: target.prelimsFinals } : {}),
      // Whether the event swims prelims and finals as saved, recorded with the version.
      splitRounds: target.rounds.prelimsFinals,
    }),
  })
}

/** Replace every lineup the builder published for the event (all rounds) with `rows`. */
async function putLineup(
  target: Pick<RelayTarget, "meetId" | "event" | "relayEvent" | "gender" | "lockToken" | "prelimsFinals">,
  rows: { round: "" | "P" | "F"; team: LineupTeam }[]
): Promise<Response> {
  return fetch(`/api/meets/${target.meetId}/relays/lineup`, {
    method: "PUT",
    headers: lockHeaders(target, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      event: target.event,
      relayEvent: target.relayEvent,
      gender: target.gender,
      rows: rows.map(({ round, team }) => ({
        round,
        letter: team.letter,
        seedTime: formatLegTime(lineupTeamTotal(team)),
        legs: team.legs.map((leg) => leg.athleteId),
      })),
      ...(target.prelimsFinals != null ? { prelimsFinals: target.prelimsFinals } : {}),
    }),
  })
}

/** A published relay with results — imports own it, and saving from the builder leaves it be. */
function isSwumRelay(relay: RelayLineup): boolean {
  return relay.resultTime != null || relay.place != null
}

/**
 * Delete the event's saved draft and the builder settings saved with it, so the builder opens on
 * the optimal lineup again. Throws on failure.
 */
export async function deleteRelayDraft(
  target: Pick<RelayTarget, "meetId" | "event" | "gender" | "lockToken">
): Promise<void> {
  const params = new URLSearchParams({ event: target.event, gender: target.gender })
  const res = await fetch(`/api/meets/${target.meetId}/relays/drafts?${params}`, {
    method: "DELETE",
    headers: lockHeaders(target),
  })
  if (!res.ok) throw new Error(await errorOf(res, "Failed to delete the draft"))
}

/** Delete one earlier version from the event's history. Throws on failure. */
export async function deleteRelayDraftVersion(
  target: Pick<RelayTarget, "meetId" | "event" | "gender" | "lockToken">,
  versionId: string
): Promise<void> {
  const params = new URLSearchParams({ event: target.event, gender: target.gender, version: versionId })
  const res = await fetch(`/api/meets/${target.meetId}/relays/drafts?${params}`, {
    method: "DELETE",
    headers: lockHeaders(target),
  })
  if (!res.ok) throw new Error(await errorOf(res, "Failed to delete the version"))
}

/**
 * Unpublish every lineup the builder published for the event (all rounds). Imported relays and
 * relays with results stay. Throws on failure.
 */
export async function unpublishRelayLineup(
  target: Pick<RelayTarget, "meetId" | "event" | "relayEvent" | "gender" | "lockToken">
): Promise<void> {
  const res = await putLineup(target, [])
  if (!res.ok) throw new Error(await errorOf(res, "Failed to unpublish the lineup"))
}

/** Save a draft; it replaces what the builder published (imported relays stay). Throws on failure. */
export async function persistRelayDraft(
  target: RelayTarget,
  teams: LineupTeam[],
  optimal = false,
  settings?: BuildSettings,
  finalsTeams?: LineupTeam[] | null
): Promise<void> {
  const res = await putDraft(target, teams, { finalsTeams, optimal, settings })
  if (!res.ok) throw new Error(await errorOf(res, "Failed to save draft"))

  // A draft replaces the published lineup — an event is never both. Imported relays
  // (from sheets/results) can't be removed and stay as they are.
  if (!target.published.some((relay) => !isSwumRelay(relay))) return
  const removed = await putLineup(target, [])
  if (!removed.ok) {
    throw new Error(await errorOf(removed, "Draft saved, but the published lineup couldn't be unpublished"))
  }
}

/**
 * Publish every relay in the lineup (each round's, at a meet with a finals session); the draft
 * becomes the published lineup with its settings, so reopening the builder restores them. Throws
 * on failure.
 */
export async function persistRelayPublish(
  target: RelayTarget,
  teams: LineupTeam[],
  settings?: BuildSettings,
  finalsTeams?: LineupTeam[] | null
): Promise<void> {
  const res = await putLineup(target, publishRows(target.rounds, teams, finalsTeams))
  if (!res.ok) throw new Error(await errorOf(res, "Failed to publish"))
  const saved = await putDraft(target, teams, { finalsTeams, settings, published: true })
  if (!saved.ok) throw new Error(await errorOf(saved, "Published, but the builder settings couldn't be saved"))
}

/** The published relays a publish leaves behind, shown on the summary before the save lands. */
export function optimisticPublished(
  target: Pick<RelayTarget, "relayEvent" | "gender" | "published" | "rounds">,
  teams: LineupTeam[],
  finalsTeams?: LineupTeam[] | null
): RelayLineup[] {
  // Publishing replaces every lineup the builder made; relays with results stay.
  const kept = target.published.filter(isSwumRelay)
  const gender: RelayLineup["gender"] =
    target.gender === "F" || target.gender === "M" || target.gender === "X" ? target.gender : ""
  return [
    ...kept,
    ...publishRows(target.rounds, teams, finalsTeams).map(({ round, team }) => ({
      key: `pending-${target.gender}-${target.relayEvent}-${team.letter}-${round}`,
      event: target.relayEvent,
      gender,
      letter: team.letter,
      round,
      eventNumber: 0,
      seedTime: formatLegTime(lineupTeamTotal(team)),
      resultTime: null,
      place: null,
      manual: true,
      legs: team.legs.map((leg, i) => ({
        leg: i + 1,
        stroke: null,
        name: leg.name,
        athleteId: leg.athleteId,
        athleteSlug: null,
      })),
    })),
  ]
}
