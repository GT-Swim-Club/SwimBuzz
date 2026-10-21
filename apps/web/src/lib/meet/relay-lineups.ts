import { Gender } from "@prisma/client"
import { athletePreferredName, type RelayLineup, type RelayLineupLeg } from "@swimbuzz/shared"
import {
  isSheetSummary,
  mergeSheetSummaries,
  uniqueRelayTeams,
} from "@/lib/meet/meet-sheet-summary"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  isRelayResultsSummary,
  relaySwimmerFullName,
  relayTeamKey,
  relayTeamPlace,
  relayTeamTime,
} from "@/lib/meet/relay-results"

const MEDLEY_LEG_STROKES = ["Back", "Breast", "Fly", "Free"] as const

export type RelayLineupMeetFields = {
  psychSheetSummary: unknown
  heatSheetSummary: unknown
  finalsHeatSheetSummary: unknown
  entriesSheetSummary: unknown
  relayResultsSummary: unknown
}

export type RelayLineupAthlete = {
  id: string
  slug: string | null
  firstName: string
  lastName: string
  preferredName: string | null
  gender: Gender
}

/** Relay teams on the meet roster summary (sheets + builder/imported relays), in meet order. */
export function buildRelayLineups(
  meet: RelayLineupMeetFields,
  athletes: RelayLineupAthlete[]
): RelayLineup[] {
  const summary = mergeSheetSummaries(
    isSheetSummary(meet.psychSheetSummary) ? meet.psychSheetSummary : null,
    isSheetSummary(meet.heatSheetSummary) ? meet.heatSheetSummary : null,
    null,
    isRelayResultsSummary(meet.relayResultsSummary) ? meet.relayResultsSummary.entries : null,
    isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null,
    isSheetSummary(meet.finalsHeatSheetSummary) ? meet.finalsHeatSheetSummary : null
  )
  if (!summary) return []

  const byId = new Map(athletes.map((a) => [a.id, a]))
  const athleteGenders = new Map(
    athletes.map((a) => [a.id, a.gender === Gender.F ? ("F" as const) : ("M" as const)])
  )

  return uniqueRelayTeams(summary.entries, athleteGenders).map((entry, index) => {
    const gender = effectiveRelayGender(entry, athleteGenders)
    const round = effectiveRelayRound(entry)
    const medley = /\bmedley\b/i.test(entry.event)
    const legs: RelayLineupLeg[] = [...(entry.relaySwimmers ?? [])]
      .sort((a, b) => a.leg - b.leg)
      .map((swimmer) => {
        const athlete = swimmer.athleteId ? byId.get(swimmer.athleteId) : undefined
        return {
          leg: swimmer.leg,
          stroke: medley ? (MEDLEY_LEG_STROKES[swimmer.leg - 1] ?? null) : null,
          name: athlete
            ? athletePreferredName(athlete)
            : (relaySwimmerFullName(swimmer.name) ?? "TBD"),
          athleteId: athlete?.id ?? null,
          athleteSlug: athlete ? (athlete.slug ?? athlete.id) : null,
        }
      })

    return {
      key: `${relayTeamKey(entry.event, entry.relayLetter ?? null, round, gender)}|${index}`,
      event: entry.event,
      gender,
      letter: displayRelayLetter(entry.relayLetter),
      round,
      eventNumber: entry.eventNumber > 0 ? entry.eventNumber : 0,
      seedTime: entry.seedTime ?? null,
      resultTime: relayTeamTime(entry) ?? null,
      place: relayTeamPlace(entry) ?? null,
      manual: entry.manual === true,
      legs,
    }
  })
}
