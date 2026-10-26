import type { LineupTeam, RelayResult, RelaySlotData } from "@/lib/meet/relay-builder"
import { lineupTeamTotal } from "@/lib/meet/relay-save"

export type PublishAllEntry = {
  data: RelaySlotData
  teams: LineupTeam[]
  /** The build's relay name, used for published relays. */
  relayEvent: string
}

export type PublishAllPlan = {
  ready: PublishAllEntry[]
  skipped: { label: string; reason: string }[]
  /** Events with nothing published (drafts and suggestions) — what the button is for. */
  unpublished: number
}

/** Why a lineup can't be published, or null when every relay has four timed swimmers. */
function incompleteReason(teams: LineupTeam[]): string | null {
  if (teams.length === 0) return "no relays in the lineup"
  const incomplete = teams.find((t) => t.legs.length !== 4 || t.legs.some((l) => !l.athleteId))
  if (incomplete) return `${incomplete.letter} relay is missing four athletes`
  const untimed = teams.find((t) => lineupTeamTotal(t) == null)
  if (untimed) return `${untimed.letter} relay needs a time for every leg`
  return null
}

/**
 * What "Publish all" would do: every event without a published lineup publishes its draft, else
 * its optimal suggestion. Events that can't publish (incomplete, or no suggestion yet) are skipped.
 */
export function planPublishAll(
  slots: RelaySlotData[],
  suggestion: (slug: string) =>
    | { status: "ok"; result: RelayResult }
    | { status: "error"; error: string }
    | undefined,
  /** Lineups of the optimal suggestion, as teams to publish. */
  teamsOf: (result: RelayResult) => LineupTeam[]
): PublishAllPlan {
  const plan: PublishAllPlan = { ready: [], skipped: [], unpublished: 0 }
  for (const data of slots) {
    const { slot, draft, published } = data
    if (!draft && published.length > 0) continue
    plan.unpublished++
    const build = suggestion(slot.slug)
    const skip = (reason: string) => plan.skipped.push({ label: slot.label, reason })
    if (draft) {
      const reason = incompleteReason(draft.teams)
      if (reason) skip(reason)
      else {
        const relayEvent = build?.status === "ok" ? build.result.relay : slot.event
        plan.ready.push({ data, teams: draft.teams, relayEvent })
      }
    } else if (build?.status === "ok") {
      const teams = teamsOf(build.result)
      const reason = incompleteReason(teams)
      if (reason) skip(reason)
      else plan.ready.push({ data, teams, relayEvent: build.result.relay })
    } else {
      skip(build?.status === "error" ? build.error.replace(/\.$/, "").toLowerCase() : "suggestion still loading")
    }
  }
  return plan
}
