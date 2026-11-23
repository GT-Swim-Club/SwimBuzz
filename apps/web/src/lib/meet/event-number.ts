import { canonicalizeStrokeEvent } from "@/lib/swim/swim-parse"
import { effectiveRelayGender } from "@/lib/meet/relay-results"
import { eventNumberForGender, type MeetSignupEventOption } from "@/lib/meet/meet-signup"
import type { SheetEntry } from "@/lib/meet/meet-sheet-summary"

/**
 * A row's event number: its own (from a heat or psych sheet), else the meet's order of events
 * (a meet packet, or the results' own "Event 1 …" headers) for its event and gender. 0 when unknown.
 */
export function resolveEntryEventNumber(
  entry: Pick<SheetEntry, "eventNumber" | "event" | "entryType" | "athleteId" | "gender" | "relaySwimmers">,
  athleteGenders?: Map<string, "M" | "F">,
  eventOptions?: MeetSignupEventOption[]
): number {
  if (entry.eventNumber > 0) return entry.eventNumber
  if (!eventOptions?.length) return 0
  // Packet names spell strokes out ("50 Butterfly"); results use "50 Fly".
  const key = canonicalizeStrokeEvent(entry.event)
  const opt = eventOptions.find((o) => canonicalizeStrokeEvent(o.event) === key)
  if (!opt) return 0
  const gender =
    entry.entryType === "relay_team"
      ? effectiveRelayGender(entry as SheetEntry, athleteGenders)
      : athleteGenders?.get(entry.athleteId)
  if (gender === "F" || gender === "M") return eventNumberForGender(opt, gender) ?? 0
  return opt.women ?? opt.men ?? 0
}

/**
 * A combined individual event — one event number for women and men (an intrasquad's "Event 1 Mixed
 * 50 Yard Backstroke", or a packet's open event) — listed as one "Mixed" event, not split by gender.
 */
export function isMixedIndividualEvent(event: string, eventOptions?: MeetSignupEventOption[]): boolean {
  if (!eventOptions?.length) return false
  const key = canonicalizeStrokeEvent(event)
  const opt = eventOptions.find((o) => !o.isRelay && canonicalizeStrokeEvent(o.event) === key)
  return !!opt && opt.women != null && opt.women === opt.men
}
