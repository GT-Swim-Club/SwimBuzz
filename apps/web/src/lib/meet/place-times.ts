import { canonicalizeStrokeEvent } from "@/lib/swim/swim-parse"
import { canonicalRelayEvent } from "@/lib/meet/relay-builder"
import { isRelaySignupEvent } from "@/lib/meet/meet-signup"

/** One event's champion, 8th and 24th place times across all teams ("1:52.46"), any of them null. */
export type PlaceTimes = {
  champion: string | null
  /** 8th place in prelims (making the A final), or a timed final's 8th. */
  eighth: string | null
  /** 24th place in prelims (making finals), or a timed final's 24th. */
  twentyFourth: string | null
}

export type PlaceTimesEvent = PlaceTimes & {
  /** "X" for a mixed relay. */
  gender: "F" | "M" | "X"
  /** As the results print it: "100 Back", "200 Medley Relay". */
  event: string
  relay: boolean
}

/** `Meet.placeTimes`: from the meet's last results PDF import. */
export type MeetPlaceTimes = { importedAt: string; events: PlaceTimesEvent[] }

const time = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)

/** The parser's `place_times` (or a stored `Meet.placeTimes`'s events), keeping only well-formed entries. */
export function coercePlaceTimesEvents(value: unknown): PlaceTimesEvent[] {
  if (!Array.isArray(value)) return []
  const out: PlaceTimesEvent[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const gender = r.gender === "F" || r.gender === "M" || r.gender === "X" ? r.gender : null
    const event = typeof r.event === "string" ? r.event.trim() : ""
    if (!gender || !event) continue
    const entry: PlaceTimesEvent = {
      gender,
      event,
      relay: r.relay === true,
      champion: time(r.champion),
      eighth: time(r.eighth),
      twentyFourth: time(r.twentyFourth),
    }
    if (entry.champion || entry.eighth || entry.twentyFourth) out.push(entry)
  }
  return out
}

export function coerceMeetPlaceTimes(value: unknown): MeetPlaceTimes | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const events = coercePlaceTimesEvents(v.events)
  return events.length > 0 ? { importedAt: typeof v.importedAt === "string" ? v.importedAt : "", events } : null
}

/**
 * Matching key for an event in either spelling: an order of events' "50 Backstroke" or
 * "4x50 Mixed Free Relay" and the results' "50 Back" or "200 Free Relay".
 */
function eventKey(event: string, relay: boolean): string {
  return (relay ? `R|${canonicalRelayEvent(event)}` : canonicalizeStrokeEvent(event)).toLowerCase()
}

/**
 * Looks up an order of events row's times for one side: `gender` is the column's (F / M), and a
 * mixed relay ("4x50 Mixed Free Relay") reads its mixed (X) times on both sides.
 */
export function placeTimesLookup(
  placeTimes: MeetPlaceTimes | null
): (gender: "F" | "M", event: string) => PlaceTimes | null {
  const byKey = new Map<string, PlaceTimes>()
  for (const entry of placeTimes?.events ?? []) {
    const key = `${entry.gender}|${eventKey(entry.event, entry.relay)}`
    if (!byKey.has(key)) byKey.set(key, entry)
  }
  return (gender, event) => {
    const relay = isRelaySignupEvent(event)
    const side = relay && /\b(mixed|co-?ed)\b/i.test(event) ? "X" : gender
    return byKey.get(`${side}|${eventKey(event, relay)}`) ?? null
  }
}
