import {
  HEAT_LANE_MAX,
  normalizeHeatStartTime,
  type CoachHeatLane,
  type HeatLaneFields,
  type SetHeatLaneInput,
  type SummaryRoundKind,
} from "@swimbuzz/shared"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  type RelayGender,
} from "@/lib/meet/relay-results"
import type { SheetEntry, SheetSummary } from "@/lib/meet/meet-sheet-summary"

/** One roster summary row's coach heat & lane, stored on Meet.heatLaneOverrides. */
export type HeatLaneOverride = {
  kind: "individual" | "relay"
  athleteId?: string
  event: string
  relayLetter?: string | null
  gender?: string
  slot: SummaryRoundKind
} & HeatLaneFields

export type HeatLaneOverridesSummary = { entries: HeatLaneOverride[] }

export function isHeatLaneOverridesSummary(value: unknown): value is HeatLaneOverridesSummary {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { entries?: unknown }).entries)
  )
}

const FIELDS = ["heat", "heatTotal", "lane", "startTime"] as const
/** What a row's coach override can hold: its heat & lane fields, and a round for a row with none. */
const STORED_FIELDS = [...FIELDS, "round"] as const

function overrideRowKey(row: Pick<HeatLaneOverride, "kind" | "athleteId" | "event" | "relayLetter" | "gender">): string {
  const event = normalizeEventName(row.event).toLowerCase()
  return row.kind === "relay"
    ? `relay|${event}|${displayRelayLetter(row.relayLetter)}|${row.gender ?? ""}`
    : `individual|${row.athleteId ?? ""}|${event}`
}

/**
 * Which row a summary entry is, for saving its heat & lane — null for rows that can't take one.
 * A relay goes by its effective gender (legacy rows infer it from the legs), so it matches however
 * the row was merged.
 */
export function heatLaneRowIdentity(
  entry: SheetEntry,
  athleteGenders?: Map<string, RelayGender>
): Pick<SetHeatLaneInput, "kind" | "athleteId" | "event" | "relayLetter" | "gender"> | null {
  if (entry.isRelayLeadoff || entry.isSwimOff || entry.rosterOnly) return null
  return entry.entryType === "relay_team"
    ? {
        kind: "relay",
        event: entry.event,
        relayLetter: displayRelayLetter(entry.relayLetter),
        gender: effectiveRelayGender(entry, athleteGenders),
      }
    : { kind: "individual", athleteId: entry.athleteId, event: entry.event }
}

/**
 * Put each row's coach heat & lane on summary entries — merged entries before they're split by
 * round, and again on collapsed relays (whose gender can change as they collapse).
 */
export function attachCoachHeatLanes<T extends SheetSummary | SheetEntry[] | null>(
  summary: T,
  overrides: unknown,
  athleteGenders?: Map<string, RelayGender>
): T {
  if (!summary || !isHeatLaneOverridesSummary(overrides) || overrides.entries.length === 0) {
    return summary
  }
  const byKey = new Map<string, CoachHeatLane>()
  for (const o of overrides.entries) {
    const key = overrideRowKey(o)
    const fields: HeatLaneFields = {}
    for (const f of STORED_FIELDS) {
      if (o[f] != null) (fields as Record<string, unknown>)[f] = o[f]
    }
    byKey.set(key, { ...byKey.get(key), [o.slot]: fields })
  }
  const attach = (entries: SheetEntry[]) =>
    entries.map((entry) => {
      const identity = heatLaneRowIdentity(entry, athleteGenders)
      const coach = identity
        ? byKey.get(overrideRowKey({ ...identity, gender: identity.gender ?? "" }))
        : undefined
      return coach ? { ...entry, coachHeatLane: coach } : entry
    })
  return (Array.isArray(summary) ? attach(summary) : { ...summary, entries: attach(summary.entries) }) as T
}

/** The round a displayed row swims: prelims, finals, or T (timed finals / not known yet). */
export function heatLaneSlot(row: SheetEntry): SummaryRoundKind {
  const round = row.entryType === "relay_team" ? effectiveRelayRound(row) : (row.resultRound ?? "")
  return round === "P" || round === "F" ? round : "T"
}

/** Whether coaches can add a heat & lane to this displayed row. */
export function canEditHeatLane(row: SheetEntry): boolean {
  if (row.isRelayLeadoff || row.isSwimOff || row.rosterOnly) return false
  // Alternates are finals-only; prelim rows may still carry the flag from merge.
  return !(row.alternate && row.resultRound !== "P")
}

function positive(n?: number | null): number | undefined {
  return n != null && n > 0 ? n : undefined
}

/** The heat & lane a displayed row shows in its own round, leaving out coach-filled fields. */
export function importedRowHeatLane(row: SheetEntry): HeatLaneFields {
  const resolved = resolvedRowHeatLane(row)
  for (const f of row.coachHeatLaneFilled ?? []) delete resolved[f]
  return resolved
}

/** The heat & lane a displayed row shows in its own round. */
function resolvedRowHeatLane(row: SheetEntry): HeatLaneFields {
  const slot = heatLaneSlot(row)
  const pick = (generic?: number, prelim?: number, final?: number) =>
    slot === "F"
      ? positive(final) ?? positive(generic)
      : slot === "P"
        ? positive(prelim) ?? positive(generic)
        : row.entryType === "relay_team"
          ? positive(generic) ?? positive(prelim) ?? positive(final)
          : positive(generic) ?? positive(final) ?? positive(prelim)
  return {
    heat: pick(row.heat, row.prelimHeat, row.finalHeat),
    heatTotal: pick(row.heatTotal, row.prelimHeatTotal, row.finalHeatTotal),
    lane: pick(row.lane, row.prelimLane, row.finalLane),
    startTime: row.startTime || undefined,
  }
}

/** The coach's round for a displayed row no import has given one (they're all on the T round). */
export function coachRowRound(row: SheetEntry): SummaryRoundKind | undefined {
  return heatLaneSlot(row) === "T" ? row.coachHeatLane?.T?.round : undefined
}

/** The coach's heat & lane for this displayed row's round. */
export function coachRowHeatLane(row: SheetEntry): HeatLaneFields {
  return row.coachHeatLane?.[heatLaneSlot(row)] ?? {}
}

/**
 * Fill a displayed row's missing heat, heats-in-event, lane and start time from the coach's,
 * so imported values always win. Writes the round's own field and the generic one, which every
 * reader falls back to.
 */
export function applyCoachHeatLane(row: SheetEntry): SheetEntry {
  if (!row.coachHeatLane || !canEditHeatLane(row)) return row
  const coach = coachRowHeatLane(row)
  const imported = importedRowHeatLane(row)
  const slot = heatLaneSlot(row)
  const patch: Partial<SheetEntry> = {}
  const set = (field: "heat" | "heatTotal" | "lane", value: number) => {
    patch[field] = value
    if (slot === "P") patch[`prelim${field[0].toUpperCase()}${field.slice(1)}` as "prelimHeat"] = value
    if (slot === "F") patch[`final${field[0].toUpperCase()}${field.slice(1)}` as "finalHeat"] = value
  }
  if (imported.heat == null && coach.heat != null) set("heat", coach.heat)
  if (imported.heatTotal == null && coach.heatTotal != null) set("heatTotal", coach.heatTotal)
  if (imported.lane == null && coach.lane != null) set("lane", coach.lane)
  if (!imported.startTime && coach.startTime) patch.startTime = coach.startTime
  const filled = FIELDS.filter((f) => f in patch)
  return filled.length > 0 ? { ...row, ...patch, coachHeatLaneFilled: filled } : row
}

function parseNumberField(value: unknown, label: string): number | undefined {
  if (value == null || value === "") return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > HEAT_LANE_MAX) {
    throw new Error(`${label} must be a whole number from 1 to ${HEAT_LANE_MAX}`)
  }
  return n
}

/** Validate a row's coach heat & lane from a request body. Throws with a message for the user. */
export function parseSetHeatLaneInput(raw: unknown): HeatLaneOverride {
  if (!raw || typeof raw !== "object") throw new Error("Invalid request")
  const body = raw as Partial<Record<keyof SetHeatLaneInput, unknown>>
  const kind = body.kind === "relay" ? "relay" : body.kind === "individual" ? "individual" : null
  const event = normalizeEventName(String(body.event ?? "").trim())
  const athleteId = String(body.athleteId ?? "").trim()
  const slot = body.slot === "P" || body.slot === "F" || body.slot === "T" ? body.slot : null
  if (!kind || !event || !slot || (kind === "individual" && !athleteId)) {
    throw new Error("A row (event, round, and athlete or relay) is required")
  }

  const heat = parseNumberField(body.heat, "Heat")
  const heatTotal = parseNumberField(body.heatTotal, "Heats in event")
  const lane = parseNumberField(body.lane, "Lane")
  if (heat != null && heatTotal != null && heat > heatTotal) {
    throw new Error("Heat can't be more than the heats in the event")
  }
  const startTime = normalizeHeatStartTime(body.startTime == null ? "" : String(body.startTime))
  if (startTime == null) throw new Error("Enter a start time like 9:30 AM")
  const round = body.round === "P" || body.round === "F" || body.round === "T" ? body.round : undefined
  if (round && slot !== "T") throw new Error("Only a row with no round can be given one")

  return {
    kind,
    event,
    slot,
    ...(kind === "individual"
      ? { athleteId }
      : {
          relayLetter: displayRelayLetter(String(body.relayLetter ?? "")),
          gender: String(body.gender ?? "").trim().toUpperCase(),
        }),
    ...(heat != null ? { heat } : {}),
    ...(heatTotal != null ? { heatTotal } : {}),
    ...(lane != null ? { lane } : {}),
    ...(startTime ? { startTime } : {}),
    ...(round ? { round } : {}),
  }
}

/** Replace a row's coach heat & lane for one round; one with no fields left is removed. */
export function upsertHeatLaneOverride(
  existing: HeatLaneOverride[],
  next: HeatLaneOverride
): HeatLaneOverride[] {
  const key = overrideRowKey(next)
  const kept = existing.filter((o) => !(overrideRowKey(o) === key && o.slot === next.slot))
  return STORED_FIELDS.some((f) => next[f] != null) ? [...kept, next] : kept
}
