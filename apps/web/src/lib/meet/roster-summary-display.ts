import {
  applyRosterNames,
  dropSeedOnlyAfterResults,
  meetHasImportedResults,
  mergeSheetSummaries,
  uniqueRelayTeams,
  type MeetResultEntry,
  type SheetEntry,
  type SheetSummary,
} from "@/lib/meet/meet-sheet-summary"
import { attachCoachHeatLanes } from "@/lib/meet/heat-lane-overrides"
import { resolveEditableSignupSheetKeys } from "@/lib/meet/meet-signup"

/** A meet's imported summaries and results — what the roster summary is built from. */
export type RosterSummarySources = {
  psychSummary?: SheetSummary | null
  heatSummary?: SheetSummary | null
  finalsHeatSummary?: SheetSummary | null
  entriesSummary?: SheetSummary | null
  results?: MeetResultEntry[] | null
  relayResults?: SheetEntry[] | null
  /** Meet.heatLaneOverrides — coach heat & lane, attached where no import has it. */
  heatLaneOverrides?: unknown
}

/**
 * Every sheet and result merged into one summary, with the coaches' heat & lane attached and roster
 * names ("Baumann, Matthew (Matt)") — the starting point for the web summary and mobile's payload.
 */
export function buildRosterSummary(
  sources: RosterSummarySources,
  athleteGenders: Map<string, "M" | "F">,
  athleteNames: Map<string, string>
): SheetSummary | null {
  return applyRosterNames(
    attachCoachHeatLanes(
      mergeSheetSummaries(
        sources.psychSummary,
        sources.heatSummary,
        sources.results ?? [],
        sources.relayResults,
        sources.entriesSummary,
        sources.finalsHeatSummary
      ),
      sources.heatLaneOverrides,
      athleteGenders
    ),
    athleteNames
  )
}

/** Any results imported (individual swims or relay times/statuses) — "Entries"/"Heats" become "Results". */
export function rosterSummaryHasResults(sources: Pick<RosterSummarySources, "results" | "relayResults">): boolean {
  return meetHasImportedResults({ individualResults: sources.results ?? [], relayResults: sources.relayResults })
}

/**
 * The rows a roster summary lists, as the web summary shows them: once results are in, psych/heat
 * seed rows for events with no result are dropped (sign-up and coach seeds stay), and each relay team
 * is one row (event + gender + letter + round) rather than its seed row beside its result row. Prelims
 * and finals stay on one row per swim (mobile lays both rounds out on it).
 */
export function rosterSummaryDisplayEntries(
  summary: SheetSummary,
  sources: RosterSummarySources,
  athleteGenders: Map<string, "M" | "F">
): SheetEntry[] {
  const keepSeedKeys = new Set(
    resolveEditableSignupSheetKeys(sources.entriesSummary, sources.psychSummary, sources.heatSummary)
  )
  const individual = dropSeedOnlyAfterResults(
    summary.entries.filter((entry) => entry.entryType !== "relay_team"),
    rosterSummaryHasResults(sources),
    keepSeedKeys
  )
  const relays = attachCoachHeatLanes(
    uniqueRelayTeams(summary.entries, athleteGenders),
    sources.heatLaneOverrides,
    athleteGenders
  )
  return [...individual, ...relays]
}
