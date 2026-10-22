import {
  relayLineupGenderLabel,
  relayLineupRoundLabel,
  type RelayLineup,
  type RelayLineupGenderGroup,
} from "./relay-lineups"

/** One relay event in a share/export: its published relays, in display order. */
export type RelayShareEvent = {
  /** Meet event number, when known. */
  number: number | null
  /** "Women 200 Medley". */
  name: string
  relays: RelayLineup[]
}

/** "Women" + "200 Medley Relay" → "Women 200 Medley". */
export function relayShareEventName(gender: RelayLineup["gender"], event: string): string {
  const name = event.replace(/\s+Relay$/i, "")
  return gender ? `${relayLineupGenderLabel(gender)} ${name}` : name
}

/** groupRelayLineups output as share events (Women, Men, Mixed). */
export function relayShareEvents(groups: RelayLineupGenderGroup[]): RelayShareEvent[] {
  return groups.flatMap((group) =>
    group.events.map((event) => ({
      number: event.eventNumber > 0 ? event.eventNumber : null,
      name: relayShareEventName(group.gender, event.event),
      relays: event.relays,
    }))
  )
}

/** Time shown for a relay: the result once swum, else the seed. */
export function relayShareTime(relay: RelayLineup): string {
  return relay.resultTime ?? relay.seedTime ?? ""
}

function csvCell(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** "A", or "A · Prelims" when an event has separate prelims and finals relays. */
function relayShareLetter(relay: RelayLineup): string {
  const round = relayLineupRoundLabel(relay.round)
  return round ? `${relay.letter} · ${round}` : relay.letter
}

const ROUND_ORDER: RelayLineup["round"][] = ["", "P", "F"]

/**
 * CSV laid out like the coaches' relay sheet: one column per event ("Women 200 Medley"),
 * and down each column a block per relay — its letter, the swimmers in leg order, then
 * the time. Blocks line up by relay across columns (every A row, then every B row, …).
 */
export function relaySummaryCsv(events: RelayShareEvent[]): string {
  const legRows = Math.max(4, ...events.flatMap((event) => event.relays.map((relay) => relay.legs.length)))
  // One block per relay letter + round that any event has, in A, B, … order.
  const blocks = [
    ...new Map(
      events.flatMap((event) => event.relays).map((relay) => [relayShareLetter(relay), relay] as const)
    ).values(),
  ].sort(
    (a, b) =>
      a.letter.localeCompare(b.letter) || ROUND_ORDER.indexOf(a.round) - ROUND_ORDER.indexOf(b.round)
  )

  const rows: string[][] = [events.map((event) => event.name)]
  for (const block of blocks) {
    const label = relayShareLetter(block)
    const blockRows: string[][] = Array.from({ length: legRows + 2 }, () => [])
    for (const event of events) {
      const relay = event.relays.find((r) => relayShareLetter(r) === label)
      const legs = relay ? [...relay.legs].sort((x, y) => x.leg - y.leg) : []
      blockRows[0].push(relay ? label : "")
      for (let i = 0; i < legRows; i++) blockRows[i + 1].push(legs[i]?.name ?? "")
      blockRows[legRows + 1].push(relay ? relayShareTime(relay) : "")
    }
    rows.push(...blockRows)
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

/** "ccs-southern-regionals-relays.png". */
export function relayShareFilename(meetName: string, ext: string): string {
  const slug = meetName
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${slug ? `${slug}-` : ""}relays.${ext}`
}
