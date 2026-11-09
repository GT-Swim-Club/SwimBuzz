import { coerceScoringTable, placePoints } from "@swimbuzz/shared"
import { isPrelimTag, isSwimOffTag, type SheetEntry } from "@/lib/meet/meet-sheet-summary"
import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"

/** A swim a scoring table scores: a final or timed final — not prelims, a swim-off or a relay leadoff. */
function scoredRound(tags: string): boolean {
  return !isPrelimTag(tags) && !isSwimOffTag(tags) && !isRelayLeadoffSwimTag(tags)
}

/**
 * The meet's swims with points from its scoring table where the results gave none: a final or
 * timed-final swim scores its place's individual points. Points from a results PDF are kept.
 */
export function scoreMeetSwims<T extends { place: number | null; points: number | null; tags: string }>(
  swims: T[],
  scoringTable: unknown
): T[] {
  const table = coerceScoringTable(scoringTable)
  if (!table) return swims
  return swims.map((swim) => {
    if (swim.points != null || !scoredRound(swim.tags)) return swim
    const points = placePoints(table.individual, swim.place)
    return points == null ? swim : { ...swim, points }
  })
}

/**
 * Relay results with points from the meet's scoring table where the results gave none: a final or
 * timed-final relay scores its place's relay points (prelims don't score).
 */
export function scoreRelayResults(entries: SheetEntry[] | null, scoringTable: unknown): SheetEntry[] | null {
  const table = coerceScoringTable(scoringTable)
  if (!table || !entries) return entries
  return entries.map((entry) => {
    if (entry.entryType !== "relay_team" || entry.relayRound === "P") return entry
    const finalPoints = entry.finalPoints ?? placePoints(table.relay, entry.finalPlace)
    const resultPoints = entry.resultPoints ?? placePoints(table.relay, entry.resultPlace)
    if (finalPoints === entry.finalPoints && resultPoints === entry.resultPoints) return entry
    return {
      ...entry,
      ...(finalPoints != null ? { finalPoints } : {}),
      ...(resultPoints != null ? { resultPoints } : {}),
    }
  })
}
