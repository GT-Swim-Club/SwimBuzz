import {
  buildAthleteLookup,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete-match"
import type { ResultSplit, SheetEntry } from "@/lib/meet-sheet-summary"
import { canonicalizeStrokeEvent, normalizeEventName, parseSwimTime } from "@/lib/swim-parse"

export type ParsedRelaySwimmer = {
  leg: number
  name: string
  athleteId?: string
  splitTime?: string
  splits?: ResultSplit[]
}

export type RelayRound = "P" | "F" | ""
export type RelayGender = "M" | "F" | "X" | ""

export function isRelayGender(value: unknown): value is "M" | "F" | "X" {
  return value === "M" || value === "F" || value === "X"
}

export type ParsedRelayResult = {
  entryType: "relay_team"
  event: string
  eventNumber?: number
  relayLetter?: string | null
  gender?: RelayGender
  relaySwimmers: ParsedRelaySwimmer[]
  time: string
  tags?: string
  place?: number
  date?: string
  heat?: number
  lane?: number
  heatTotal?: number
  seedTime?: string
}

function rosterName(athleteId: string, roster: RosterAthlete[]): string {
  const athlete = roster.find((a) => a.id === athleteId)
  return athlete ? `${athlete.lastName}, ${athlete.firstName}` : ""
}

export function relayRoundFromTags(tags: string): RelayRound {
  const t = tags.trim().toUpperCase()
  if (t === "P" || t.includes("PRELIM")) return "P"
  if (t === "F" || t.includes("FINAL")) return "F"
  return ""
}

export function parseRelayGender(value: unknown): RelayGender {
  const raw = String(value ?? "").trim().toUpperCase()
  if (raw === "F" || raw === "FEMALE" || raw === "W" || raw === "WOMEN" || raw === "GIRLS")
    return "F"
  if (raw === "M" || raw === "MALE" || raw === "MEN" || raw === "BOYS") return "M"
  if (raw === "X" || raw === "MIXED" || raw === "COED" || raw === "CO-ED") return "X"
  return ""
}

export function relayGenderFromEventName(event: string): RelayGender {
  if (/\bmixed\b/i.test(event) || /\bco-?ed\b/i.test(event)) return "X"
  return ""
}

/** Canonical relay event for grouping — "4x50 Mixed Freestyle Relay" matches "200 Free Relay". */
export function relayEventKey(event: string): string {
  return canonicalizeStrokeEvent(event)
    .replace(/\bMixed\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Stored gender, or infer from relay leg roster when missing (legacy imports). */
export function effectiveRelayGender(
  entry: SheetEntry,
  athleteGenders?: Map<string, RelayGender>
): RelayGender {
  if (isRelayGender(entry.gender)) return entry.gender
  const fromEvent = relayGenderFromEventName(entry.event)
  if (fromEvent) return fromEvent
  if (!athleteGenders || !entry.relaySwimmers?.length) return ""
  const legs = entry.relaySwimmers
    .map((s) => (s.athleteId ? athleteGenders.get(s.athleteId) : undefined))
    .filter((g): g is "M" | "F" => g === "M" || g === "F")
  if (legs.length === 0) return ""
  if (legs.some((g) => g === "F") && legs.some((g) => g === "M")) return "X"
  if (legs.every((g) => g === "F")) return "F"
  if (legs.every((g) => g === "M")) return "M"
  return ""
}

export function relayGenderLabel(gender: RelayGender): string {
  if (gender === "F") return "Women's"
  if (gender === "M") return "Men's"
  if (gender === "X") return "Mixed"
  return ""
}

/** Valid relay team letter, or null when missing / not A–D. */
export function normalizeRelayLetter(relayLetter: string | null | undefined): string | null {
  const letter = (relayLetter ?? "").trim().toUpperCase()
  if (letter === "A" || letter === "B" || letter === "C" || letter === "D") return letter
  return null
}

/** Relay letter for display — defaults to A when missing. */
export function displayRelayLetter(relayLetter: string | null | undefined): string {
  return normalizeRelayLetter(relayLetter) ?? "A"
}

/** Drop missing/invalid relay leg splits (e.g. SwimPhone "No Data"). */
export function sanitizeRelaySplitTime(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined
  const trimmed = value.trim()
  if (/^no data$/i.test(trimmed)) return undefined
  return parseSwimTime(trimmed) ? trimmed : undefined
}

/** Sanitize interval 50 splits attached to a relay leg. */
export function sanitizeRelayLegSplits(value: unknown): ResultSplit[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: ResultSplit[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    const distance = Number(r.distance)
    const splitTime = sanitizeRelaySplitTime(String(r.splitTime ?? ""))
    if (!Number.isFinite(distance) || distance <= 0 || !splitTime) continue
    out.push({ distance, splitTime })
  }
  out.sort((a, b) => a.distance - b.distance)
  return out.length > 0 ? out : undefined
}

const PLACEHOLDER_LEG = /^leg\s*\d+$/i
const RELAY_LEGS = [1, 2, 3, 4] as const

/** False for empty / "Leg 1"-style placeholders used when roster is unknown. */
export function isRealRelaySwimmerName(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const trimmed = name.trim()
  if (PLACEHOLDER_LEG.test(trimmed)) return false
  return Boolean(relaySwimmerFullName(trimmed))
}

export function relayHasCompleteRoster(entry: SheetEntry): boolean {
  const swimmers = entry.relaySwimmers ?? []
  return RELAY_LEGS.every((leg) => {
    const swimmer = swimmers.find((s) => s.leg === leg)
    return swimmer && isRealRelaySwimmerName(swimmer.name)
  })
}

export function relayHasCompleteSplits(entry: SheetEntry): boolean {
  if (!relayHasCompleteRoster(entry)) return false
  const swimmers = entry.relaySwimmers ?? []
  return RELAY_LEGS.every((leg) => {
    const swimmer = swimmers.find((s) => s.leg === leg)
    return Boolean(sanitizeRelaySplitTime(swimmer?.splitTime))
  })
}

/** Coach-facing hint when a relay still needs roster and/or leg splits. */
export function relayCoachIncompleteNote(entry: SheetEntry): string | null {
  if (entry.entryType !== "relay_team") return null
  if (!relayHasCompleteRoster(entry)) return "No roster"
  const hasResult = Boolean(relayTeamTime(entry))
  if (hasResult && !relayHasCompleteSplits(entry)) return "No splits"
  return null
}

/** Last name only — for compact relay row display ("Last, First" or "First Last"). */
export function relaySwimmerLastName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed || PLACEHOLDER_LEG.test(trimmed)) return null
  const comma = trimmed.indexOf(", ")
  if (comma > 0) return trimmed.slice(0, comma).trim() || null
  const parts = trimmed.split(/\s+/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1]! : null
}

/** Full name — for relay detail popup ("First Last"). */
export function relaySwimmerFullName(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed || PLACEHOLDER_LEG.test(trimmed)) return null
  const comma = trimmed.indexOf(", ")
  if (comma > 0) {
    const last = trimmed.slice(0, comma).trim()
    const first = trimmed.slice(comma + 2).trim()
    if (first && last) return `${first} ${last}`
    return trimmed
  }
  return trimmed
}

/** Individual event for a relay leadoff (leg 1) — e.g. 200 Medley Relay → 50 Back. */
export function leadoffEventFromRelay(relayEvent: string): string | null {
  const event = relayEventKey(relayEvent)
  const match = event.match(/^(\d+)\s+(Medley|Free)\s+Relay$/i)
  if (!match) return null
  const total = parseInt(match[1], 10)
  if (!Number.isFinite(total) || total % 4 !== 0) return null
  const legDistance = total / 4
  const stroke = match[2].toLowerCase() === "medley" ? "Back" : "Free"
  return normalizeEventName(`${legDistance} ${stroke}`)
}

/** Swim tags for a relay leadoff — encodes source relay and round. */
export function leadoffSwimTags(relayEvent: string, relayRound: RelayRound = ""): string {
  const event = normalizeEventName(relayEvent)
  if (!event) return "R"
  return relayRound ? `R|${event}|${relayRound}` : `R|${event}`
}

export function isRelayLeadoffSwimTag(tags: string): boolean {
  const t = tags.trim().toUpperCase()
  return t === "R" || t.startsWith("R|")
}

export function parseLeadoffTag(tags: string): {
  relayEvent?: string
  round?: RelayRound
} {
  const trimmed = tags.trim()
  if (!isRelayLeadoffSwimTag(trimmed)) return {}
  if (trimmed.toUpperCase() === "R") return {}
  const parts = trimmed.split("|")
  if (parts.length < 2) return {}
  return {
    relayEvent: normalizeEventName(parts[1] ?? ""),
    round: relayRoundFromTags(parts[2] ?? ""),
  }
}

export function leadoffResultKey(
  athleteId: string,
  leadoffEvent: string,
  relaySource?: string,
  relayRound?: RelayRound
): string {
  return `${athleteId}|${normalizeEventName(leadoffEvent)}|leadoff|${normalizeEventName(relaySource ?? "")}|${relayRound ?? ""}`
}

/** Infer round from stored fields (legacy rows without relayRound). */
export function effectiveRelayRound(entry: SheetEntry): RelayRound {
  if (entry.relayRound === "P" || entry.relayRound === "F") return entry.relayRound
  const fromTags = relayRoundFromTags(entry.resultTags ?? "")
  if (fromTags) return fromTags
  if (entry.prelimTime && !entry.finalTime && !entry.resultTime) return "P"
  if (entry.finalTime && !entry.prelimTime && !entry.resultTime) return "F"
  return ""
}

export function relayTeamTime(entry: SheetEntry): string | undefined {
  const round = effectiveRelayRound(entry)
  if (round === "F") return entry.resultTime ?? entry.finalTime
  if (round === "P") return entry.resultTime ?? entry.prelimTime
  return entry.resultTime ?? entry.finalTime ?? entry.prelimTime
}

export function relayTeamPlace(entry: SheetEntry): number | undefined {
  const round = effectiveRelayRound(entry)
  if (round === "P") return entry.prelimPlace ?? entry.resultPlace
  if (round === "F") return entry.finalPlace ?? entry.resultPlace
  return entry.resultPlace
}

/** Import relay team results — roster match optional; one stored row per team. */
export function matchRelayResultsToRoster(
  parsed: ParsedRelayResult[],
  roster: RosterAthlete[],
  nameMappings?: Record<string, string> | null
): SheetEntry[] {
  const lookup = buildAthleteLookup(roster)
  const byTeam = new Map<string, SheetEntry>()

  for (const row of parsed) {
    const event = normalizeEventName(row.event)
    if (!event || !row.time?.trim()) continue

    const relayRound = relayRoundFromTags(row.tags ?? "")
    const gender = row.gender ?? ""
    const teamKey = relayTeamKey(
      event,
      normalizeRelayLetter(row.relayLetter),
      relayRound,
      gender
    )
    if (byTeam.has(teamKey)) continue

    const relaySwimmers = row.relaySwimmers
      .slice()
      .sort((a, b) => a.leg - b.leg)
      .map((leg) => {
        const rawName = leg.name.trim()
        const name = rawName || `Leg ${leg.leg}`
        const athleteId = isRealRelaySwimmerName(rawName)
          ? matchAthleteIdFast(rawName, lookup, nameMappings)
          : undefined
        const splitTime = sanitizeRelaySplitTime(leg.splitTime)
        const splits = sanitizeRelayLegSplits(leg.splits)
        return {
          leg: leg.leg,
          name,
          ...(athleteId ? { athleteId } : {}),
          ...(splitTime ? { splitTime } : {}),
          ...(splits ? { splits } : {}),
        }
      })

    const firstMatched = relaySwimmers.find((s) => s.athleteId)
    const athleteId = firstMatched?.athleteId ?? `relay:${teamKey}`
    const swimmerNames = relaySwimmers
      .map((s) => relaySwimmerLastName(s.name))
      .filter((n): n is string => Boolean(n))
    const athleteName =
      swimmerNames.join(", ") ||
      `Relay ${row.relayLetter ?? ""}`.trim() ||
      event

    const place = row.place != null && row.place > 0 ? row.place : undefined
    const heat = row.heat != null && row.heat > 0 ? row.heat : undefined
    const lane = row.lane != null ? row.lane : undefined
    const heatTotal = row.heatTotal != null && heat != null ? row.heatTotal : undefined

    byTeam.set(teamKey, {
      athleteId,
      athleteName,
      event,
      eventNumber: row.eventNumber ?? 0,
      entryType: "relay_team",
      relayLetter: normalizeRelayLetter(row.relayLetter),
      relayRound,
      gender,
      relaySwimmers,
      resultTime: row.time,
      resultPlace: place,
      resultTags: row.tags ?? "",
      manual: false,
      ...(heat != null ? { heat } : {}),
      ...(lane != null ? { lane } : {}),
      ...(heatTotal != null ? { heatTotal } : {}),
      ...(relayRound === "F" && heat != null ? { finalHeat: heat } : {}),
      ...(relayRound === "F" && lane != null ? { finalLane: lane } : {}),
      ...(relayRound === "F" && heatTotal != null ? { finalHeatTotal: heatTotal } : {}),
      ...(relayRound === "P" && heat != null ? { prelimHeat: heat } : {}),
      ...(relayRound === "P" && lane != null ? { prelimLane: lane } : {}),
      ...(relayRound === "P" && heatTotal != null ? { prelimHeatTotal: heatTotal } : {}),
      ...(row.seedTime ? { seedTime: row.seedTime } : {}),
    })
  }

  return [...byTeam.values()]
}

export function coerceParsedRelayResults(raw: unknown): ParsedRelayResult[] {
  if (!Array.isArray(raw)) return []
  const out: ParsedRelayResult[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") continue
    const r = row as Record<string, unknown>
    if (r.entryType !== "relay_team") continue
    const swimmers = Array.isArray(r.relaySwimmers) ? r.relaySwimmers : []
    const relaySwimmers = swimmers
      .map((leg) => {
        if (!leg || typeof leg !== "object") return null
        const l = leg as Record<string, unknown>
        const name = String(l.name ?? "").trim()
        const legNum = parseInt(String(l.leg ?? ""), 10)
        if (!Number.isFinite(legNum)) return null
        const splitTime = sanitizeRelaySplitTime(String(l.splitTime ?? ""))
        const splits = sanitizeRelayLegSplits(l.splits)
        if (!name && !splitTime && !splits?.length) return null
        const swimmer: ParsedRelaySwimmer = {
          leg: legNum,
          name: name || `Leg ${legNum}`,
        }
        if (splitTime) swimmer.splitTime = splitTime
        if (splits) swimmer.splits = splits
        return swimmer
      })
      .filter((leg): leg is ParsedRelaySwimmer => leg !== null)
    const time = String(r.time ?? "").trim()
    const event = normalizeEventName(String(r.event ?? ""))
    if (!time || !event) continue
    const place =
      typeof r.place === "number" && r.place > 0 ? r.place : undefined
    const heat =
      typeof r.heat === "number" && r.heat > 0 ? r.heat : undefined
    const lane = typeof r.lane === "number" ? r.lane : undefined
    const heatTotal =
      typeof r.heatTotal === "number" && heat != null ? r.heatTotal : undefined
    const seedTime = String(r.seedTime ?? "").trim() || undefined
    out.push({
      entryType: "relay_team",
      event,
      relayLetter: normalizeRelayLetter(r.relayLetter ? String(r.relayLetter) : null),
      gender: parseRelayGender(r.gender),
      relaySwimmers,
      time,
      tags: r.tags ? String(r.tags) : undefined,
      place,
      date: r.date ? String(r.date) : undefined,
      ...(heat != null ? { heat } : {}),
      ...(lane != null ? { lane } : {}),
      ...(heatTotal != null ? { heatTotal } : {}),
      ...(seedTime ? { seedTime } : {}),
    })
  }
  return out
}

export function relayTeamKey(
  event: string,
  relayLetter: string | null | undefined,
  relayRound: RelayRound = "",
  gender: RelayGender = ""
): string {
  return `${normalizeEventName(event)}|${normalizeRelayLetter(relayLetter) ?? "A"}|${relayRound}|${gender}`
}

export type RelayTeamInput = {
  event: string
  relayLetter?: string | null
  relayRound?: RelayRound
  gender?: RelayGender
  legs: Array<{
    leg: number
    athleteId: string
    splitTime?: string
    splits?: ResultSplit[]
  }>
  resultTime?: string
  resultPlace?: number
  seedTime?: string
  manual?: boolean
}

/** One stored relay team row (same shape as imported results). */
export function buildRelaySheetEntries(
  relay: RelayTeamInput,
  roster: RosterAthlete[]
): SheetEntry[] {
  const event = normalizeEventName(relay.event)
  const letter = normalizeRelayLetter(relay.relayLetter)
  const round = relay.relayRound ?? ""
  const gender = relay.gender ?? ""
  const byId = new Map(roster.map((a) => [a.id, a]))

  const relaySwimmers = relay.legs
    .slice()
    .sort((a, b) => a.leg - b.leg)
    .map((leg) => {
      const athlete = byId.get(leg.athleteId)
      const name = athlete
        ? `${athlete.lastName}, ${athlete.firstName}`
        : leg.athleteId
      const splitTime = sanitizeRelaySplitTime(leg.splitTime)
      const splits = sanitizeRelayLegSplits(leg.splits)
      return {
        leg: leg.leg,
        name,
        athleteId: leg.athleteId,
        ...(splitTime ? { splitTime } : {}),
        ...(splits ? { splits } : {}),
      }
    })

  const teamKey = relayTeamKey(event, letter, round, gender)
  const firstMatched = relaySwimmers.find((s) => s.athleteId)
  const athleteId = firstMatched?.athleteId ?? `relay:${teamKey}`
  const swimmerNames = relaySwimmers
    .map((s) => relaySwimmerLastName(s.name))
    .filter((n): n is string => Boolean(n))
  const athleteName =
    swimmerNames.join(", ") ||
    `Relay ${displayRelayLetter(letter)}` ||
    event

  return [
    {
      athleteId,
      athleteName,
      event,
      eventNumber: 0,
      entryType: "relay_team" as const,
      relayLetter: letter,
      relayRound: round,
      gender,
      relaySwimmers,
      resultTime: relay.resultTime,
      resultPlace: relay.resultPlace,
      ...(relay.seedTime ? { seedTime: relay.seedTime } : {}),
      manual: relay.manual ?? true,
    },
  ]
}

/** Keep heat/lane, seed, and round-specific result fields when updating swimmers. */
export function preserveRelayEntryFields(
  updated: SheetEntry,
  existing: SheetEntry
): SheetEntry {
  const round = effectiveRelayRound(existing) || effectiveRelayRound(updated)
  const existingGenericHeat =
    existing.heat != null && existing.heat > 0 ? existing.heat : undefined
  const existingPrelimHeat =
    existing.prelimHeat ?? (round === "P" ? existingGenericHeat : undefined)
  const existingFinalHeat =
    existing.finalHeat ?? (round === "F" ? existingGenericHeat : undefined)
  const existingGenericLane = existing.lane
  const existingPrelimLane =
    existing.prelimLane ?? (round === "P" ? existingGenericLane : undefined)
  const existingFinalLane =
    existing.finalLane ?? (round === "F" ? existingGenericLane : undefined)

  return {
    ...updated,
    eventNumber: existing.eventNumber || updated.eventNumber,
    seedTime: updated.seedTime ?? existing.seedTime,
    timeStatus: existing.timeStatus ?? updated.timeStatus,
    seedRank: existing.seedRank ?? updated.seedRank,
    heat: updated.heat ?? existingGenericHeat,
    heatTotal: updated.heatTotal ?? existing.heatTotal,
    lane: updated.lane ?? existingGenericLane,
    prelimHeat: updated.prelimHeat ?? existingPrelimHeat,
    prelimHeatTotal: updated.prelimHeatTotal ?? existing.prelimHeatTotal,
    prelimLane: updated.prelimLane ?? existingPrelimLane,
    finalHeat: updated.finalHeat ?? existingFinalHeat,
    finalHeatTotal: updated.finalHeatTotal ?? existing.finalHeatTotal,
    finalLane: updated.finalLane ?? existingFinalLane,
    prelimTime: existing.prelimTime ?? updated.prelimTime,
    finalTime: existing.finalTime ?? updated.finalTime,
    prelimPlace: existing.prelimPlace ?? updated.prelimPlace,
    finalPlace: existing.finalPlace ?? updated.finalPlace,
    resultStatus: existing.resultStatus ?? updated.resultStatus,
    prelimStatus: existing.prelimStatus ?? updated.prelimStatus,
    finalStatus: existing.finalStatus ?? updated.finalStatus,
    resultTags: existing.resultTags ?? updated.resultTags,
    resultRound: existing.resultRound ?? updated.resultRound,
    resultTime: updated.resultTime ?? existing.resultTime,
    resultPlace: updated.resultPlace ?? existing.resultPlace,
    manual: updated.manual ?? existing.manual,
  }
}

export function removeRelayTeamEntries(
  entries: SheetEntry[],
  event: string,
  relayLetter: string | null | undefined,
  relayRound: RelayRound = "",
  gender: RelayGender = "",
  athleteGenders?: Map<string, RelayGender>
): SheetEntry[] {
  const key = relayTeamKey(event, relayLetter, relayRound, gender)
  return entries.filter(
    (e) =>
      e.entryType !== "relay_team" ||
      relayTeamKey(
        e.event,
        e.relayLetter,
        effectiveRelayRound(e),
        effectiveRelayGender(e, athleteGenders)
      ) !== key
  )
}

export function upsertRelayTeamEntries(
  entries: SheetEntry[],
  relay: RelayTeamInput,
  roster: RosterAthlete[],
  athleteGenders?: Map<string, RelayGender>
): SheetEntry[] {
  const round = relay.relayRound ?? ""
  const gender = relay.gender ?? ""
  const existingEntry = findRelayTeamEntry(
    entries,
    relay.event,
    relay.relayLetter,
    round,
    gender,
    athleteGenders
  )
  const without = removeRelayTeamEntries(
    entries,
    relay.event,
    relay.relayLetter,
    round,
    gender,
    athleteGenders
  )
  const [built] = buildRelaySheetEntries({ ...relay, manual: relay.manual ?? true }, roster)
  const merged = existingEntry
    ? preserveRelayEntryFields(built, existingEntry)
    : built
  return [...without, merged]
}

export function findRelayTeamEntry(
  entries: SheetEntry[],
  event: string,
  relayLetter: string | null | undefined,
  relayRound: RelayRound = "",
  gender: RelayGender = "",
  athleteGenders?: Map<string, RelayGender>
): SheetEntry | undefined {
  const key = relayTeamKey(event, relayLetter, relayRound, gender)
  return entries.find(
    (e) =>
      e.entryType === "relay_team" &&
      relayTeamKey(
        e.event,
        e.relayLetter,
        effectiveRelayRound(e),
        effectiveRelayGender(e, athleteGenders)
      ) === key
  )
}

export function isRelayResultsSummary(value: unknown): value is { entries: SheetEntry[] } {
  if (!value || typeof value !== "object") return false
  const summary = value as { entries?: unknown }
  if (!Array.isArray(summary.entries)) return false
  return summary.entries.every(
    (e) =>
      typeof (e as SheetEntry).athleteId === "string" &&
      typeof (e as SheetEntry).event === "string" &&
      (e as SheetEntry).entryType === "relay_team"
  )
}
