/** One swimmer on a relay lineup, in leg order. */
export type RelayLineupLeg = {
  leg: number
  /** Medley stroke for this leg ("Back", "Breast", "Fly", "Free"); null for free relays. */
  stroke: string | null
  name: string
  athleteId: string | null
  /** Athlete page slug (or id) when the swimmer is matched to the roster. */
  athleteSlug: string | null
}

/** A relay team on the meet roster summary — builder-added or imported. */
export type RelayLineup = {
  key: string
  event: string
  gender: "M" | "F" | "X" | ""
  letter: string
  /** Prelims (P) vs finals (F) team; "" for timed finals / unknown. */
  round: "P" | "F" | ""
  eventNumber: number
  seedTime: string | null
  resultTime: string | null
  place: number | null
  /** Builder-added relay (staff can remove it); imported relays are read-only. */
  manual: boolean
  legs: RelayLineupLeg[]
}

export type RelayLineupEventGroup = {
  event: string
  eventNumber: number
  relays: RelayLineup[]
}

export type RelayLineupGenderGroup = {
  gender: RelayLineup["gender"]
  label: string
  events: RelayLineupEventGroup[]
}

const GENDER_ORDER: RelayLineup["gender"][] = ["F", "M", "X", ""]

export function relayLineupGenderLabel(gender: RelayLineup["gender"]): string {
  if (gender === "F") return "Women"
  if (gender === "M") return "Men"
  if (gender === "X") return "Mixed"
  return "Relays"
}

export function relayLineupRoundLabel(round: RelayLineup["round"]): string | null {
  if (round === "P") return "Prelims"
  if (round === "F") return "Finals"
  return null
}

/** Women / Men / Mixed, then events in the order the server sorted them (meet order). */
export function groupRelayLineups(lineups: RelayLineup[]): RelayLineupGenderGroup[] {
  return GENDER_ORDER.map((gender) => {
    const events: RelayLineupEventGroup[] = []
    for (const relay of lineups) {
      if (relay.gender !== gender) continue
      const group = events.find(
        (e) => e.event === relay.event && e.eventNumber === relay.eventNumber
      )
      if (group) group.relays.push(relay)
      else events.push({ event: relay.event, eventNumber: relay.eventNumber, relays: [relay] })
    }
    return { gender, label: relayLineupGenderLabel(gender), events }
  }).filter((group) => group.events.length > 0)
}

export function relayLineupHasAthlete(relay: RelayLineup, athleteId: string | null | undefined) {
  return Boolean(athleteId) && relay.legs.some((leg) => leg.athleteId === athleteId)
}
