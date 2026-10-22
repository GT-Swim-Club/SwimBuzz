import type { RelayLineup } from "@swimbuzz/shared"
import { formatLegTime, type BuildSettings, type LineupTeam } from "@/lib/meet/relay-builder"

/** A lineup the coach saved from the relay builder, to persist after leaving it. */
export type RelayCommit = {
  kind: "draft" | "publish"
  teams: LineupTeam[]
  /** The build's relay name, used for published relays. */
  relayEvent: string
  /** The draft matches the optimal lineup (drafts only). */
  optimal?: boolean
  /** The builder settings in use (drafts only). */
  settings?: BuildSettings
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
  hadDraft: boolean
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

/** Save a draft; it replaces what the builder published (imported relays stay). Throws on failure. */
export async function persistRelayDraft(target: RelayTarget, teams: LineupTeam[],
  optimal = false,
  settings?: BuildSettings
): Promise<void> {
  const res = await fetch(`/api/meets/${target.meetId}/relays/drafts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: target.event,
      gender: target.gender,
      optimal,
      settings: settings ?? null,
      teams: teams.map((team) => ({
        letter: team.letter,
        legs: team.legs.map((leg) => ({
          athleteId: leg.athleteId,
          timeMs: leg.timeMs ?? null,
          ...(leg.custom ? { custom: true } : {}),
        })),
      })),
    }),
  })
  if (!res.ok) throw new Error(await errorOf(res, "Failed to save draft"))

  // A draft replaces the published lineup — an event is never both. Imported relays
  // (from sheets/results) can't be removed and stay as they are.
  for (const relay of target.published) {
    if (!relay.manual) continue
    const params = new URLSearchParams({
      event: relay.event,
      relayLetter: relay.letter,
      relayRound: relay.round,
      gender: target.gender,
    })
    const removed = await fetch(`/api/meets/${target.meetId}/relays?${params}`, { method: "DELETE" })
    if (!removed.ok) {
      throw new Error(
        await errorOf(removed, `Draft saved, but the published ${relay.letter} relay couldn't be unpublished`)
      )
    }
  }
}

/** Publish every relay in the lineup and clear the draft. Throws on failure. */
export async function persistRelayPublish(target: RelayTarget, teams: LineupTeam[]): Promise<void> {
  for (const team of teams) {
    const res = await fetch(`/api/meets/${target.meetId}/relays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: target.relayEvent,
        gender: target.gender,
        relayLetter: team.letter,
        relayRound: "",
        seedTime: formatLegTime(lineupTeamTotal(team)),
        legs: team.legs.map((leg, i) => ({ leg: i + 1, athleteId: leg.athleteId })),
      }),
    })
    if (!res.ok) throw new Error(await errorOf(res, `Failed to publish the ${team.letter} relay`))
  }
  // Builder-made relays no longer in the lineup (e.g. a C relay that was dropped).
  const letters = new Set(teams.map((team) => team.letter))
  for (const relay of target.published) {
    if (!relay.manual || relay.round !== "" || letters.has(relay.letter)) continue
    const params = new URLSearchParams({
      event: relay.event,
      relayLetter: relay.letter,
      relayRound: "",
      gender: target.gender,
    })
    await fetch(`/api/meets/${target.meetId}/relays?${params}`, { method: "DELETE" })
  }
  if (target.hadDraft) {
    const params = new URLSearchParams({ event: target.event, gender: target.gender })
    await fetch(`/api/meets/${target.meetId}/relays/drafts?${params}`, { method: "DELETE" })
  }
}

/** The published relays a publish leaves behind, shown on the summary before the save lands. */
export function optimisticPublished(
  target: Pick<RelayTarget, "relayEvent" | "gender" | "published">,
  teams: LineupTeam[]
): RelayLineup[] {
  // Publishing replaces every builder-made relay without a round; imported ones stay.
  const kept = target.published.filter((relay) => !relay.manual || relay.round !== "")
  const gender: RelayLineup["gender"] =
    target.gender === "F" || target.gender === "M" || target.gender === "X" ? target.gender : ""
  return [
    ...kept,
    ...teams.map((team) => ({
      key: `pending-${target.gender}-${target.relayEvent}-${team.letter}`,
      event: target.relayEvent,
      gender,
      letter: team.letter,
      round: "" as const,
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
