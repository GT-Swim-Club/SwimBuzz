import { formatTime } from "@/lib/utils"
import { compareRelayEvents, compareSwimEvents, normalizeEventName } from "@/lib/swim-parse"
import { displayMeetResultTags } from "@/lib/swim-tags"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  isRelayGender,
  isRelayLeadoffSwimTag,
  leadoffEventFromRelay,
  leadoffResultKey,
  normalizeRelayLetter,
  parseLeadoffTag,
  relayEventKey,
  relayGenderFromEventName,
  relayTeamKey,
  sanitizeRelaySplitTime,
} from "@/lib/relay-results"

export type SheetEntry = {
  athleteId: string
  athleteName: string
  event: string
  eventNumber: number
  entryType: "individual" | "relay_team"
  seedTime?: string
  timeStatus?: string
  seedRank?: number
  heat?: number
  heatTotal?: number
  lane?: number
  /** Heat/lane from prelims heat sheet or prelims results. */
  prelimHeat?: number
  prelimHeatTotal?: number
  prelimLane?: number
  /** Heat/lane scraped from finals results. */
  finalHeat?: number
  finalHeatTotal?: number
  finalLane?: number
  round?: string
  /** When prelims/finals are split into separate display rows. */
  resultRound?: "P" | "F" | ""
  startTime?: string | null
  relayLetter?: string | null
  /** Prelims (P) vs finals (F) relay team — separate rosters allowed. */
  relayRound?: "P" | "F" | ""
  /** Women's (F), men's (M), or mixed (X) — same event name can appear for each. */
  gender?: "M" | "F" | "X" | ""
  relaySwimmers?: Array<{
    leg: number
    name: string
    athleteId?: string
    /** Individual leg split time (not cumulative). */
    splitTime?: string
  }>
  /** Formatted result time from imported/manual swims (timed-finals meets). */
  resultTime?: string
  /** Prelim and final times when both are imported for the same event. */
  prelimTime?: string
  finalTime?: string
  /** Relay leadoff time (tag R) — kept separate from the individual swim. */
  relayLeadoffTime?: string
  isRelayLeadoff?: boolean
  /** Parent relay event for a leadoff row (e.g. 200 Medley Relay). */
  relayLeadoffSource?: string
  relayLeadoffRound?: "P" | "F" | ""
  resultPlace?: number
  prelimPlace?: number
  finalPlace?: number
  resultStatus?: string
  prelimStatus?: string
  finalStatus?: string
  resultTags?: string
  /** Manually added relay or swim — fully editable. Imported relays omit this. */
  manual?: boolean
  /** Swim row id when this entry is a single manual swim. */
  swimId?: string
  course?: string
  date?: string
  timeMs?: number
}

export type SheetSummary = {
  sheetType: "psych" | "heat"
  course: string
  entries: SheetEntry[]
}

export type MeetResultEntry = {
  athleteId: string
  athleteName: string
  event: string
  seedTime?: string
  resultTime?: string
  prelimTime?: string
  finalTime?: string
  relayLeadoffTime?: string
  isRelayLeadoff?: boolean
  relayLeadoffSource?: string
  relayLeadoffRound?: "P" | "F" | ""
  resultPlace?: number
  prelimPlace?: number
  finalPlace?: number
  resultStatus?: string
  prelimStatus?: string
  finalStatus?: string
  resultTags?: string
  prelimHeat?: number
  prelimHeatTotal?: number
  prelimLane?: number
  finalHeat?: number
  finalHeatTotal?: number
  finalLane?: number
  manual?: boolean
  swimId?: string
  course?: string
  date?: string
  timeMs?: number
}

function resultGroupKey(athleteId: string, event: string, tags: string): string {
  if (isRelayLeadoffSwimTag(tags)) {
    const { relayEvent, round } = parseLeadoffTag(tags)
    return leadoffResultKey(athleteId, event, relayEvent, round)
  }
  return `${athleteId}|${event}|swim`
}

function isPrelimTag(tags: string): boolean {
  const t = tags.trim().toUpperCase()
  return t === "P" || t.includes("PRELIM")
}

function isFinalTag(tags: string): boolean {
  const t = tags.trim().toUpperCase()
  return t === "F" || t.includes("FINAL")
}

function isFinalsRound(round?: string): boolean {
  const r = (round ?? "").toLowerCase()
  return r === "f" || r === "finals" || r.includes("final")
}

function isPrelimsRound(round?: string): boolean {
  const r = (round ?? "").toLowerCase()
  return r === "p" || r === "prelims" || r.includes("prelim")
}

export function individualSheetKey(athleteId: string, event: string): string {
  return `${athleteId}|${normalizeEventName(event)}|individual|`
}

function positiveHeat(heat?: number): number | undefined {
  return heat != null && heat > 0 ? heat : undefined
}

/** Heat/lane already on a sheet row for the given result round. */
function sheetHeatLaneForRound(
  entry: SheetEntry,
  tags = ""
): { heat?: number; lane?: number; heatTotal?: number } {
  if (isPrelimTag(tags)) {
    return {
      heat:
        positiveHeat(entry.prelimHeat) ??
        (isPrelimsRound(entry.round) || entry.relayRound === "P"
          ? positiveHeat(entry.heat)
          : undefined),
      lane:
        entry.prelimLane ??
        (isPrelimsRound(entry.round) || entry.relayRound === "P"
          ? entry.lane
          : undefined),
      heatTotal:
        entry.prelimHeatTotal ??
        (isPrelimsRound(entry.round) || entry.relayRound === "P"
          ? entry.heatTotal
          : undefined),
    }
  }
  if (isFinalTag(tags)) {
    return {
      heat:
        positiveHeat(entry.finalHeat) ??
        (isFinalsRound(entry.round) || entry.relayRound === "F"
          ? positiveHeat(entry.heat)
          : undefined),
      lane:
        entry.finalLane ??
        (isFinalsRound(entry.round) || entry.relayRound === "F"
          ? entry.lane
          : undefined),
      heatTotal:
        entry.finalHeatTotal ??
        (isFinalsRound(entry.round) || entry.relayRound === "F"
          ? entry.heatTotal
          : undefined),
    }
  }
  return {
    heat:
      positiveHeat(entry.heat) ??
      positiveHeat(entry.finalHeat) ??
      positiveHeat(entry.prelimHeat),
    lane: entry.lane ?? entry.finalLane ?? entry.prelimLane,
    heatTotal: entry.heatTotal ?? entry.finalHeatTotal ?? entry.prelimHeatTotal,
  }
}

/** Import only heat/lane fields missing from an existing heat sheet row. */
export function resultHeatLanePatchFromSheet(
  sheetEntry: SheetEntry | undefined,
  tags: string,
  heat?: number,
  lane?: number,
  heatTotal?: number
): { heat?: number; lane?: number; heatTotal?: number } | null {
  const resultHeat = positiveHeat(heat)
  const resultLane = lane != null ? lane : undefined
  if (resultHeat == null && resultLane == null) return null

  if (!sheetEntry) {
    return {
      ...(resultHeat != null ? { heat: resultHeat } : {}),
      ...(resultLane != null ? { lane: resultLane } : {}),
      ...(heatTotal != null && resultHeat != null ? { heatTotal } : {}),
    }
  }

  const sheet = sheetHeatLaneForRound(sheetEntry, tags)
  const patch: { heat?: number; lane?: number; heatTotal?: number } = {}
  if (resultHeat != null && sheet.heat == null) patch.heat = resultHeat
  if (resultLane != null && sheet.lane == null) patch.lane = resultLane
  if (
    heatTotal != null &&
    sheet.heatTotal == null &&
    (sheet.heat != null || patch.heat != null)
  ) {
    patch.heatTotal = heatTotal
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/** True when a parsed heat sheet summary has roster rows. */
export function hasHeatSheetSummary(
  summary: SheetSummary | null | undefined
): boolean {
  return Boolean(summary?.entries?.length)
}

function resultHeatFieldsFromMeetResult(
  result: MeetResultEntry
): Pick<
  SheetEntry,
  | "prelimHeat"
  | "prelimLane"
  | "prelimHeatTotal"
  | "finalHeat"
  | "finalLane"
  | "finalHeatTotal"
  | "heat"
  | "heatTotal"
  | "lane"
> {
  return {
    prelimHeat: result.prelimHeat,
    prelimLane: result.prelimLane,
    prelimHeatTotal: result.prelimHeatTotal,
    finalHeat: result.finalHeat ?? result.prelimHeat,
    finalLane: result.finalLane ?? result.prelimLane,
    finalHeatTotal: result.finalHeatTotal ?? result.prelimHeatTotal,
    heat: result.finalHeat ?? result.prelimHeat,
    lane: result.finalLane ?? result.prelimLane,
    heatTotal: result.finalHeatTotal ?? result.prelimHeatTotal,
  }
}

function mergeResultHeatIntoSheetEntry(
  existing: SheetEntry,
  result: MeetResultEntry,
  hasHeatSheet: boolean
): Pick<
  SheetEntry,
  | "prelimHeat"
  | "prelimLane"
  | "prelimHeatTotal"
  | "finalHeat"
  | "finalLane"
  | "finalHeatTotal"
  | "heat"
  | "heatTotal"
  | "lane"
> {
  if (!hasHeatSheet) {
    return resultHeatFieldsFromMeetResult(result)
  }

  const prelimSheet = sheetHeatLaneForRound(existing, "P")
  const finalSheet = sheetHeatLaneForRound(existing, "F")
  const genericSheet = sheetHeatLaneForRound(existing, "")

  return {
    prelimHeat: prelimSheet.heat ?? result.prelimHeat,
    prelimLane: prelimSheet.lane ?? result.prelimLane,
    prelimHeatTotal: prelimSheet.heatTotal ?? result.prelimHeatTotal,
    finalHeat: finalSheet.heat ?? genericSheet.heat ?? result.finalHeat,
    finalLane: finalSheet.lane ?? genericSheet.lane ?? result.finalLane,
    finalHeatTotal:
      finalSheet.heatTotal ?? genericSheet.heatTotal ?? result.finalHeatTotal,
    heat:
      genericSheet.heat ?? result.finalHeat ?? result.prelimHeat ?? undefined,
    lane: genericSheet.lane ?? result.finalLane ?? result.prelimLane ?? undefined,
    heatTotal:
      genericSheet.heatTotal ??
      result.finalHeatTotal ??
      result.prelimHeatTotal ??
      undefined,
  }
}

/** Map heat sheet rows by individual or relay team key for import-time lookups. */
export function buildHeatSheetLookup(
  summary: SheetSummary | null | undefined
): Map<string, SheetEntry> {
  const map = new Map<string, SheetEntry>()
  if (!summary?.entries?.length) return map

  for (const entry of summary.entries) {
    if (entry.entryType === "relay_team") {
      map.set(
        relayTeamKey(
          entry.event,
          entry.relayLetter,
          entry.relayRound ?? "",
          entry.gender ?? ""
        ),
        entry
      )
      continue
    }
    if (entry.isRelayLeadoff) continue
    map.set(individualSheetKey(entry.athleteId, entry.event), entry)
  }
  return map
}

function displayResultTags(tags: string): string | undefined {
  return displayMeetResultTags(tags)
}

function applyResultStatus(
  entry: MeetResultEntry,
  status: string | null | undefined,
  tags: string
): MeetResultEntry {
  if (!status) return entry
  if (isPrelimTag(tags)) return { ...entry, prelimStatus: status }
  if (isFinalTag(tags)) return { ...entry, finalStatus: status }
  return { ...entry, resultStatus: status }
}

function mergeMeetResultEntry(
  a: MeetResultEntry,
  b: MeetResultEntry
): MeetResultEntry {
  return {
    ...a,
    ...b,
    athleteId: a.athleteId,
    athleteName: a.athleteName || b.athleteName,
    event: a.event,
    resultTime: a.resultTime ?? b.resultTime,
    prelimTime: a.prelimTime ?? b.prelimTime,
    finalTime: a.finalTime ?? b.finalTime,
    seedTime: a.seedTime ?? b.seedTime,
    relayLeadoffTime: a.relayLeadoffTime ?? b.relayLeadoffTime,
    isRelayLeadoff: a.isRelayLeadoff || b.isRelayLeadoff,
    relayLeadoffSource: a.relayLeadoffSource ?? b.relayLeadoffSource,
    relayLeadoffRound: a.relayLeadoffRound || b.relayLeadoffRound || "",
    resultPlace: a.resultPlace ?? b.resultPlace,
    prelimPlace: a.prelimPlace ?? b.prelimPlace,
    finalPlace: a.finalPlace ?? b.finalPlace,
    resultStatus: a.resultStatus ?? b.resultStatus,
    prelimStatus: a.prelimStatus ?? b.prelimStatus,
    finalStatus: a.finalStatus ?? b.finalStatus,
    resultTags: a.resultTags || b.resultTags,
    prelimHeat: a.prelimHeat ?? b.prelimHeat,
    prelimLane: a.prelimLane ?? b.prelimLane,
    prelimHeatTotal: a.prelimHeatTotal ?? b.prelimHeatTotal,
    finalHeat: a.finalHeat ?? b.finalHeat,
    finalLane: a.finalLane ?? b.finalLane,
    finalHeatTotal: a.finalHeatTotal ?? b.finalHeatTotal,
    swimId: a.swimId ?? b.swimId,
    manual:
      a.swimId && b.swimId && a.swimId !== b.swimId
        ? false
        : Boolean(a.manual || b.manual),
    course: a.course ?? b.course,
    date: a.date ?? b.date,
    timeMs: a.timeMs ?? b.timeMs,
  }
}

export function mergeMeetResultEntries(
  ...groups: MeetResultEntry[][]
): MeetResultEntry[] {
  const byKey = new Map<string, MeetResultEntry>()
  for (const group of groups) {
    for (const entry of group) {
      const key = resultKey(
        entry.athleteId,
        entry.event,
        entry.isRelayLeadoff,
        entry.relayLeadoffSource,
        entry.relayLeadoffRound
      )
      const existing = byKey.get(key)
      byKey.set(key, existing ? mergeMeetResultEntry(existing, entry) : entry)
    }
  }
  return [...byKey.values()]
}

/** Build separate leadoff result rows from relay leg-1 splits (never merge into individual swims). */
export function relayLeadoffsFromSplits(
  relayResults: SheetEntry[] | null | undefined
): MeetResultEntry[] {
  if (!relayResults?.length) return []

  const out: MeetResultEntry[] = []
  const seen = new Set<string>()

  for (const relay of relayResults) {
    if (relay.entryType !== "relay_team") continue
    const leg1 = relay.relaySwimmers?.find((s) => s.leg === 1)
    const leadoffEvent = leadoffEventFromRelay(relay.event)
    if (!leadoffEvent || !leg1?.athleteId) continue

    const split = sanitizeRelaySplitTime(leg1.splitTime)
    if (!split) continue

    const round = effectiveRelayRound(relay)
    const source = normalizeEventName(relay.event)
    const key = leadoffResultKey(leg1.athleteId, leadoffEvent, source, round)
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      athleteId: leg1.athleteId,
      athleteName: leg1.name || relay.athleteName,
      event: leadoffEvent,
      isRelayLeadoff: true,
      relayLeadoffTime: split,
      relayLeadoffSource: source,
      relayLeadoffRound: round,
    })
  }

  return out
}

/** @deprecated Use mergeMeetResultEntries(results, relayLeadoffsFromSplits(relays)) instead. */
export function overlayRelayLeadoffsFromSplits(
  results: MeetResultEntry[],
  relayResults: SheetEntry[] | null | undefined
): MeetResultEntry[] {
  return mergeMeetResultEntries(results, relayLeadoffsFromSplits(relayResults))
}

/** Group imported NS/DQ/etc. rows by athlete + event, combining prelim/final. */
export function statusesToMeetResults(
  rows: Array<{
    athleteId: string
    athleteName: string
    event: string
    status: string
    tags: string
  }>
): MeetResultEntry[] {
  const byKey = new Map<string, MeetResultEntry>()

  for (const row of rows) {
    const key = resultGroupKey(row.athleteId, row.event, row.tags)
    let existing = byKey.get(key) ?? {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      event: row.event,
    }
    existing = applyResultStatus(existing, row.status, row.tags)
    byKey.set(key, existing)
  }

  return [...byKey.values()]
}

/** Group imported seed times by athlete + event. */
export function seedsToMeetResults(
  rows: Array<{
    athleteId: string
    athleteName: string
    event: string
    seedTime: string
  }>
): MeetResultEntry[] {
  const byKey = new Map<string, MeetResultEntry>()

  for (const row of rows) {
    const key = resultKey(row.athleteId, row.event, false)
    const existing = byKey.get(key) ?? {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      event: row.event,
    }
    byKey.set(key, { ...existing, seedTime: row.seedTime })
  }

  return [...byKey.values()]
}

/** Group imported heat/lane rows by athlete + event, routing by prelim/final tag. */
export function placementsToMeetResults(
  rows: Array<{
    athleteId: string
    athleteName: string
    event: string
    tags: string
    heat?: number
    lane?: number
    heatTotal?: number
  }>
): MeetResultEntry[] {
  const byKey = new Map<string, MeetResultEntry>()

  for (const row of rows) {
    const key = resultKey(row.athleteId, row.event, false)
    let existing = byKey.get(key) ?? {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      event: row.event,
    }

    const heat = row.heat != null && row.heat > 0 ? row.heat : undefined
    const lane = row.lane != null ? row.lane : undefined

    if (isPrelimTag(row.tags)) {
      if (heat != null) existing = { ...existing, prelimHeat: heat }
      if (lane != null) existing = { ...existing, prelimLane: lane }
      if (row.heatTotal != null) {
        existing = { ...existing, prelimHeatTotal: row.heatTotal }
      }
    } else if (isFinalTag(row.tags)) {
      if (heat != null) existing = { ...existing, finalHeat: heat }
      if (lane != null) existing = { ...existing, finalLane: lane }
      if (row.heatTotal != null) {
        existing = { ...existing, finalHeatTotal: row.heatTotal }
      }
    } else {
      if (heat != null) existing = { ...existing, finalHeat: heat }
      if (lane != null) existing = { ...existing, finalLane: lane }
      if (row.heatTotal != null) {
        existing = { ...existing, finalHeatTotal: row.heatTotal }
      }
    }

    byKey.set(key, existing)
  }

  return [...byKey.values()]
}

export function isResultStatusesSummary(
  value: unknown
): value is { entries: MeetResultEntry[] } {
  if (!value || typeof value !== "object") return false
  const summary = value as { entries?: unknown }
  if (!Array.isArray(summary.entries)) return false
  return summary.entries.every(
    (e) =>
      typeof (e as MeetResultEntry).athleteId === "string" &&
      typeof (e as MeetResultEntry).event === "string"
  )
}

function applyResultPlace(
  entry: MeetResultEntry,
  place: number | null | undefined,
  tags: string
): MeetResultEntry {
  if (place == null || place < 1) return entry
  if (isPrelimTag(tags)) return { ...entry, prelimPlace: place }
  if (isFinalTag(tags)) return { ...entry, finalPlace: place }
  return { ...entry, resultPlace: place }
}

type SwimResultInput = {
  id: string
  source: string
  athleteId: string
  athleteName: string
  event: string
  timeMs: number
  tags: string
  place?: number | null
  course: string
  date: string
}

function applyManualSwimMeta(
  entry: MeetResultEntry,
  swims: SwimResultInput[]
): MeetResultEntry {
  if (swims.length !== 1 || swims[0].source !== "manual") return entry
  const swim = swims[0]
  if (isRelayLeadoffSwimTag(swim.tags)) return entry
  return {
    ...entry,
    manual: true,
    swimId: swim.id,
    course: swim.course,
    date: swim.date,
    timeMs: swim.timeMs,
  }
}

/** Group meet swims by athlete + event, combining prelim/final rows. */
export function swimsToMeetResults(swims: SwimResultInput[]): MeetResultEntry[] {
  const byKey = new Map<string, MeetResultEntry>()
  const swimsByKey = new Map<string, SwimResultInput[]>()

  for (const swim of swims) {
    const key = resultGroupKey(swim.athleteId, swim.event, swim.tags)
    let existing = byKey.get(key) ?? {
      athleteId: swim.athleteId,
      athleteName: swim.athleteName,
      event: swim.event,
    }
    const time = formatTime(swim.timeMs)

    if (isRelayLeadoffSwimTag(swim.tags)) {
      const { relayEvent, round } = parseLeadoffTag(swim.tags)
      existing.isRelayLeadoff = true
      existing.relayLeadoffTime = time
      if (relayEvent) existing.relayLeadoffSource = relayEvent
      if (round) existing.relayLeadoffRound = round
    } else if (isPrelimTag(swim.tags)) {
      existing.prelimTime = time
    } else if (isFinalTag(swim.tags)) {
      existing.finalTime = time
    } else {
      existing.resultTime = time
      const tags = displayResultTags(swim.tags)
      if (tags) existing.resultTags = tags
    }

    existing = applyResultPlace(existing, swim.place, swim.tags)
    byKey.set(key, existing)
    swimsByKey.set(key, [...(swimsByKey.get(key) ?? []), swim])
  }

  return [...byKey.entries()].map(([key, entry]) =>
    applyManualSwimMeta(entry, swimsByKey.get(key) ?? [])
  )
}

export function isSheetSummary(value: unknown): value is SheetSummary {
  if (!value || typeof value !== "object") return false
  const summary = value as SheetSummary
  if (!["psych", "heat"].includes(summary.sheetType)) return false
  if (typeof summary.course !== "string") return false
  if (!Array.isArray(summary.entries)) return false
  return summary.entries.every(
    (e) =>
      typeof e.athleteId === "string" &&
      typeof e.athleteName === "string" &&
      typeof e.event === "string" &&
      typeof e.eventNumber === "number"
  )
}

export function groupSheetByAthlete(entries: SheetEntry[]) {
  const byAthlete = new Map<string, { name: string; entries: SheetEntry[] }>()
  for (const entry of entries) {
    if (entry.entryType === "relay_team") continue
    if (!byAthlete.has(entry.athleteId)) {
      byAthlete.set(entry.athleteId, { name: entry.athleteName, entries: [] })
    }
    byAthlete.get(entry.athleteId)!.entries.push(entry)
  }
  return [...byAthlete.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function hasSwimResultData(entry: SheetEntry): boolean {
  return Boolean(
    entry.resultTime ||
      entry.prelimTime ||
      entry.finalTime ||
      entry.relayLeadoffTime ||
      entry.resultStatus ||
      entry.prelimStatus ||
      entry.finalStatus
  )
}

/** True when an individual event has no separate prelim+final rounds (timed finals). */
export function isTimedFinalsEvent(entries: SheetEntry[], event: string): boolean {
  const eventKey = normalizeEventName(event)
  let hasPrelim = false
  let hasFinal = false

  for (const e of entries) {
    if (e.entryType !== "individual" || e.isRelayLeadoff) continue
    if (normalizeEventName(e.event) !== eventKey) continue
    if (!hasSwimResultData(e)) continue

    const prelim = Boolean(e.prelimTime || e.prelimStatus)
    const finals = Boolean(
      e.finalTime || (e.finalStatus && e.finalStatus !== "NS")
    )
    if (prelim && finals) return false
    if (prelim) hasPrelim = true
    if (finals) hasFinal = true
  }

  return !(hasPrelim && hasFinal)
}

/** True when this entry is a single-round result (no separate prelims and finals). */
export function isTimedFinalsEntry(
  entry: SheetEntry,
  options?: { allEntries?: SheetEntry[] }
): boolean {
  const hasRelayResult =
    entry.entryType === "relay_team" &&
    Boolean(entry.resultTime || entry.prelimTime || entry.finalTime)
  const hasIndividualResult =
    entry.entryType !== "relay_team" &&
    !entry.isRelayLeadoff &&
    hasSwimResultData(entry)
  if (!hasRelayResult && !hasIndividualResult) return false

  if (entry.resultRound === "P") return false
  if (entry.prelimTime && entry.finalTime) return false

  if (entry.entryType === "relay_team") {
    if (entry.resultRound === "F") return false
    const round = entry.relayRound || effectiveRelayRound(entry)
    if (round === "P" || round === "F") return false
    if (entry.prelimTime || entry.finalTime) return false
    return Boolean(entry.resultTime)
  }

  const timedFinalsEvent =
    options?.allEntries != null
      ? isTimedFinalsEvent(options.allEntries, entry.event)
      : false

  if (entry.resultRound === "F") {
    return timedFinalsEvent
  }

  if (entry.prelimTime) return false
  if (entry.finalTime) return timedFinalsEvent
  return Boolean(entry.resultTime)
}

/** Hide psych/heat seed rows for events with no imported result once results exist. */
export function dropSeedOnlyAfterResults(
  entries: SheetEntry[],
  hasImportedResults: boolean
): SheetEntry[] {
  if (!hasImportedResults) return entries
  return entries.filter((entry) => {
    if (entry.entryType !== "individual" || entry.isRelayLeadoff) return true
    return hasSwimResultData(entry)
  })
}

const INDIVIDUAL_ROUND_ORDER: Record<string, number> = { P: 0, F: 1, "": 2 }

/** Split combined prelim+final entries into separate roster rows. */
export function expandIndividualResultRows(entries: SheetEntry[]): SheetEntry[] {
  const out: SheetEntry[] = []
  const timedFinalsCache = new Map<string, boolean>()

  function eventIsTimedFinals(event: string): boolean {
    const key = normalizeEventName(event)
    const cached = timedFinalsCache.get(key)
    if (cached !== undefined) return cached
    const value = isTimedFinalsEvent(entries, event)
    timedFinalsCache.set(key, value)
    return value
  }

  for (const entry of entries) {
    if (entry.entryType !== "individual" || entry.isRelayLeadoff) {
      out.push(entry)
      continue
    }

    const hasPrelim = Boolean(entry.prelimTime || entry.prelimStatus)
    const hasFinal = Boolean(
      entry.finalTime || (entry.finalStatus && entry.finalStatus !== "NS")
    )

    if (!hasPrelim || !hasFinal) {
      if (hasFinal && !hasPrelim) {
        if (eventIsTimedFinals(entry.event)) {
          out.push({
            ...entry,
            resultRound: "",
            resultTime: entry.resultTime ?? entry.finalTime,
            resultPlace: entry.resultPlace ?? entry.finalPlace,
            resultStatus:
              entry.resultStatus ??
              (entry.finalStatus && entry.finalStatus !== "NS"
                ? entry.finalStatus
                : undefined),
            finalTime: undefined,
            finalStatus: undefined,
            finalPlace: undefined,
            finalHeat: undefined,
            finalLane: undefined,
            finalHeatTotal: undefined,
            heat: entry.finalHeat ?? entry.heat,
            lane: entry.finalLane ?? entry.lane,
            heatTotal: entry.finalHeatTotal ?? entry.heatTotal,
          })
        } else {
          out.push({
            ...entry,
            resultRound: "F",
            heat: entry.finalHeat ?? entry.heat,
            lane: entry.finalLane ?? entry.lane,
            heatTotal: entry.finalHeatTotal ?? entry.heatTotal,
          })
        }
      } else if (hasPrelim && !hasFinal) {
        out.push({
          ...entry,
          resultRound: "P",
          heat: entry.prelimHeat ?? entry.heat,
          lane: entry.prelimLane ?? entry.lane,
          heatTotal: entry.prelimHeatTotal ?? entry.heatTotal,
        })
      } else if (hasSwimResultData(entry)) {
        out.push({
          ...entry,
          heat: entry.finalHeat ?? entry.prelimHeat ?? entry.heat,
          lane: entry.finalLane ?? entry.prelimLane ?? entry.lane,
          heatTotal:
            entry.finalHeatTotal ?? entry.prelimHeatTotal ?? entry.heatTotal,
        })
      } else {
        out.push(entry)
      }
      continue
    }

    out.push({
      ...entry,
      resultRound: "P",
      heat: entry.prelimHeat ?? entry.heat,
      lane: entry.prelimLane ?? entry.lane,
      heatTotal: entry.prelimHeatTotal ?? entry.heatTotal,
      finalTime: undefined,
      finalStatus: undefined,
      finalPlace: undefined,
      finalHeat: undefined,
      finalLane: undefined,
      finalHeatTotal: undefined,
      resultTime: undefined,
      resultStatus: undefined,
      resultPlace: undefined,
    })

    out.push({
      ...entry,
      resultRound: "F",
      heat: entry.finalHeat ?? entry.heat,
      lane: entry.finalLane ?? entry.lane,
      heatTotal: entry.finalHeatTotal ?? entry.heatTotal,
      prelimTime: undefined,
      prelimStatus: undefined,
      prelimPlace: undefined,
      prelimHeat: undefined,
      prelimLane: undefined,
      prelimHeatTotal: undefined,
      seedRank: undefined,
      timeStatus: undefined,
      resultTime: undefined,
      resultStatus: undefined,
      resultPlace: undefined,
    })
  }

  return out
}

/** Fill missing prelim/final heat totals from the max heat in each event. */
export function inferResultHeatTotals(entries: SheetEntry[]): SheetEntry[] {
  const maxPrelim = new Map<string, number>()
  const maxFinal = new Map<string, number>()

  for (const entry of entries) {
    if (entry.entryType !== "individual") continue
    const event = normalizeEventName(entry.event)
    if (entry.prelimHeat != null) {
      maxPrelim.set(event, Math.max(maxPrelim.get(event) ?? 0, entry.prelimHeat))
    }
    if (entry.finalHeat != null) {
      maxFinal.set(event, Math.max(maxFinal.get(event) ?? 0, entry.finalHeat))
    }
  }

  if (maxPrelim.size === 0 && maxFinal.size === 0) return entries

  return entries.map((entry) => {
    if (entry.entryType !== "individual") return entry
    const event = normalizeEventName(entry.event)
    const patch: Partial<SheetEntry> = {}
    if (entry.prelimHeat != null && entry.prelimHeatTotal == null) {
      const total = maxPrelim.get(event)
      if (total != null) patch.prelimHeatTotal = total
    }
    if (entry.finalHeat != null && entry.finalHeatTotal == null) {
      const total = maxFinal.get(event)
      if (total != null) patch.finalHeatTotal = total
    }
    return Object.keys(patch).length > 0 ? { ...entry, ...patch } : entry
  })
}

export function compareIndividualEntries(a: SheetEntry, b: SheetEntry): number {
  const ev = compareSwimEvents(a.event, b.event)
  if (ev !== 0) return ev
  const src = (a.relayLeadoffSource ?? "").localeCompare(b.relayLeadoffSource ?? "")
  if (src !== 0) return src
  return (
    (INDIVIDUAL_ROUND_ORDER[a.resultRound ?? a.relayLeadoffRound ?? ""] ?? 2) -
    (INDIVIDUAL_ROUND_ORDER[b.resultRound ?? b.relayLeadoffRound ?? ""] ?? 2)
  )
}

const RELAY_ROUND_ORDER: Record<string, number> = { P: 0, F: 1, "": 2 }
const RELAY_GENDER_ORDER: Record<string, number> = { F: 0, M: 1, X: 2, "": 3 }

function relayBucketGender(
  entry: SheetEntry,
  athleteGenders?: Map<string, "M" | "F">
): string {
  if (entry.gender === "X") return "X"
  if (relayGenderFromEventName(entry.event) === "X") return "X"
  return effectiveRelayGender(entry, athleteGenders) || entry.gender || ""
}

function groupIndicatesMixed(
  entries: SheetEntry[],
  athleteGenders?: Map<string, "M" | "F">
): boolean {
  const legGenders = new Set<"M" | "F" | "X">()
  for (const entry of entries) {
    if (entry.gender === "X") return true
    if (relayGenderFromEventName(entry.event) === "X") return true
    const g = effectiveRelayGender(entry, athleteGenders)
    if (g) legGenders.add(g)
    if (legGenders.has("X") || (legGenders.has("M") && legGenders.has("F"))) return true
  }
  return false
}

/** Fold mis-tagged M/F buckets into the mixed bucket for the same team. */
function mergeRelayGenderBuckets(
  byBase: Map<string, SheetEntry[]>,
  athleteGenders?: Map<string, "M" | "F">
): Map<string, SheetEntry[]> {
  const merged = new Map(byBase)
  const keys = [...merged.keys()]

  for (let i = 0; i < keys.length; i++) {
    const keyA = keys[i]
    if (!merged.has(keyA)) continue
    const partsA = keyA.split("|")
    const eventA = partsA[0] ?? ""
    const letterA = partsA[1] ?? ""
    const genderA = partsA[2] ?? ""

    for (let j = i + 1; j < keys.length; j++) {
      const keyB = keys[j]
      if (!merged.has(keyB)) continue
      const partsB = keyB.split("|")
      if (partsB[0] !== eventA || partsB[1] !== letterA) continue

      const genderB = partsB[2] ?? ""
      if (genderA === genderB) continue
      if (genderA !== "X" && genderB !== "X") continue

      const xKey = genderA === "X" ? keyA : keyB
      const dropKey = genderA === "X" ? keyB : keyA
      const dropGender = (genderA === "X" ? genderB : genderA) as "M" | "F"
      const dropEntries = merged.get(dropKey) ?? []
      const combined = [...(merged.get(xKey) ?? []), ...dropEntries]

      if (!groupIndicatesMixed(combined, athleteGenders)) continue
      if (!dropEntries.every((e) => isMisTaggedMixedRelayEntry(e, dropGender, athleteGenders))) {
        continue
      }

      merged.set(xKey, combined)
      merged.delete(dropKey)
    }
  }

  return merged
}

/** True when a row in an M/F bucket is actually a mixed relay with a wrong tag. */
function isMisTaggedMixedRelayEntry(
  entry: SheetEntry,
  bucketGender: "M" | "F",
  athleteGenders?: Map<string, "M" | "F">
): boolean {
  if (bucketGender !== "M" && bucketGender !== "F") return false
  if (entry.gender === "X" || relayGenderFromEventName(entry.event) === "X") return true
  if (effectiveRelayGender(entry, athleteGenders) === "X") return true
  // Explicit men's/women's relay — never fold into mixed.
  if (entry.gender === bucketGender) return false
  return false
}

function relayBaseKey(
  entry: SheetEntry,
  athleteGenders?: Map<string, "M" | "F">
): string {
  const gender = relayBucketGender(entry, athleteGenders)
  const event = relayEventKey(entry.event)
  const letter = displayRelayLetter(entry.relayLetter)
  return `${event}|${letter}|${gender}`
}

function findRelayBaseKey(
  byBase: Map<string, SheetEntry[]>,
  entry: SheetEntry,
  athleteGenders?: Map<string, "M" | "F">
): string {
  const key = relayBaseKey(entry, athleteGenders)
  if (byBase.has(key)) return key

  const event = relayEventKey(entry.event)
  const letter = displayRelayLetter(entry.relayLetter)
  const gender = relayBucketGender(entry, athleteGenders)

  // Only fold untagged / mis-tagged rows into an existing mixed bucket.
  if (gender === "M" || gender === "F") {
    if (isRelayGender(entry.gender) && entry.gender === gender) return key
    if (relayGenderFromEventName(entry.event) === "X") {
      for (const existingKey of byBase.keys()) {
        const parts = existingKey.split("|")
        if (parts[0] === event && parts[1] === letter && parts[2] === "X") {
          return existingKey
        }
      }
    }
    if (effectiveRelayGender(entry, athleteGenders) === "X") {
      for (const existingKey of byBase.keys()) {
        const parts = existingKey.split("|")
        if (parts[0] === event && parts[1] === letter && parts[2] === "X") {
          return existingKey
        }
      }
    }
  }

  return key
}

function coalesceMixedRelayGroup(
  entries: SheetEntry[],
  baseKey?: string,
  athleteGenders?: Map<string, "M" | "F">
): SheetEntry[] {
  const keyGender = baseKey?.split("|")[2] ?? ""
  const isMixed =
    keyGender === "X" ||
    groupIndicatesMixed(entries, athleteGenders)
  if (!isMixed) return entries
  return entries.map((e) =>
    e.gender === "X" ? e : { ...e, gender: "X" as const }
  )
}

/** Collapse seed/psych/heat/roster rows with prelims or finals for one relay team. */
function collapseRelayLetterGroup(entries: SheetEntry[]): SheetEntry[] {
  if (entries.length <= 1) return entries

  let seed: SheetEntry | undefined
  let prelims: SheetEntry | undefined
  let finals: SheetEntry | undefined
  let timed: SheetEntry | undefined

  for (const entry of entries) {
    if (!hasRelayResultData(entry)) {
      seed = seed ? mergeEntries(seed, entry) : entry
      continue
    }
    const round = entryRelayRound(entry)
    if (round === "P") {
      prelims = prelims ? mergeEntries(prelims, entry) : entry
    } else if (round === "F") {
      finals = finals ? mergeEntries(finals, entry) : entry
    } else {
      timed = timed ? mergeEntries(timed, entry) : entry
    }
  }

  const out: SheetEntry[] = []

  if (prelims) {
    out.push(seed ? mergeEntries(seed, prelims) : prelims)
    seed = undefined
  } else if (finals) {
    out.push(seed ? mergeEntries(seed, finals) : finals)
    seed = undefined
  } else if (timed) {
    out.push(seed ? mergeEntries(seed, timed) : timed)
    seed = undefined
  }

  if (seed) out.push(seed)
  if (finals && prelims) out.push(finals)
  if (timed && (prelims || finals)) out.push(timed)

  return out
}

function collapseRelayGroup(entries: SheetEntry[]): SheetEntry[] {
  if (entries.length <= 1) return entries

  const byLetter = new Map<string, SheetEntry[]>()
  for (const entry of entries) {
    const letter = normalizeRelayLetter(entry.relayLetter) ?? "A"
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), entry])
  }

  return [...byLetter.values()].flatMap(collapseRelayLetterGroup)
}

/** One row per relay team (event + gender + letter + round), not one per leg. */
export function uniqueRelayTeams(
  entries: SheetEntry[],
  athleteGenders?: Map<string, "M" | "F">
): SheetEntry[] {
  const byBase = new Map<string, SheetEntry[]>()
  for (const entry of entries) {
    if (entry.entryType !== "relay_team") continue
    const base = findRelayBaseKey(byBase, entry, athleteGenders)
    byBase.set(base, [...(byBase.get(base) ?? []), entry])
  }

  const mergedBuckets = mergeRelayGenderBuckets(byBase, athleteGenders)

  const collapsed: SheetEntry[] = []
  for (const [baseKey, group] of mergedBuckets.entries()) {
    collapsed.push(
      ...coalesceMixedRelayGroup(collapseRelayGroup(group), baseKey, athleteGenders)
    )
  }

  return collapsed.sort((a, b) => {
    const ga = effectiveRelayGender(a, athleteGenders)
    const gb = effectiveRelayGender(b, athleteGenders)
    const genderCmp = (RELAY_GENDER_ORDER[ga] ?? 3) - (RELAY_GENDER_ORDER[gb] ?? 3)
    if (genderCmp !== 0) return genderCmp
    const ev = compareRelayEvents(a.event, b.event)
    if (ev !== 0) return ev
    const letter = (a.relayLetter ?? "").localeCompare(b.relayLetter ?? "")
    if (letter !== 0) return letter
    const ra = RELAY_ROUND_ORDER[effectiveRelayRound(a)] ?? 2
    const rb = RELAY_ROUND_ORDER[effectiveRelayRound(b)] ?? 2
    return ra - rb
  })
}

function entryKey(entry: SheetEntry): string {
  if (entry.entryType === "relay_team") {
    // Psych/heat seed rows share one key per team so lane/heat merge with seed rank.
    if (!entry.relaySwimmers?.length) {
      return `relay_seed|${relayTeamSeedKey(entry)}`
    }
    const relay = entry.relayLetter ?? ""
    const round = entry.relayRound ?? ""
    const gender = entry.gender ?? ""
    return `${entry.athleteId}|${normalizeEventName(entry.event)}|relay_team|${relay}|${round}|${gender}`
  }
  if (entry.isRelayLeadoff) {
    return leadoffResultKey(
      entry.athleteId,
      entry.event,
      entry.relayLeadoffSource,
      entry.relayLeadoffRound
    )
  }
  return `${entry.athleteId}|${normalizeEventName(entry.event)}|${entry.entryType}|`
}

function hasRelayResultData(entry: SheetEntry): boolean {
  return Boolean(entry.resultTime || entry.finalTime || entry.prelimTime)
}

function hasRelaySeedData(entry: SheetEntry): boolean {
  return Boolean(
    entry.seedTime ||
      entry.timeStatus ||
      entry.seedRank != null ||
      entry.heat != null ||
      entry.lane != null
  )
}

function entryRelayRound(entry: SheetEntry): "P" | "F" | "" {
  return effectiveRelayRound(entry)
}

/** Seed/psych/heat rows merge with prelims, or finals when there are no prelims. */
function relayRoundsCompatibleForMerge(a: SheetEntry, b: SheetEntry): boolean {
  const ra = entryRelayRound(a)
  const rb = entryRelayRound(b)
  if (ra === rb) return true
  if (!ra && (rb === "P" || rb === "F")) return true
  if ((ra === "P" || ra === "F") && !rb) return true
  return false
}

function relayGendersCompatible(
  a: SheetEntry,
  b: SheetEntry,
  athleteGenders?: Map<string, "M" | "F">
): boolean {
  const ga = effectiveRelayGender(a, athleteGenders) || a.gender || ""
  const gb = effectiveRelayGender(b, athleteGenders) || b.gender || ""
  if (!ga || !gb) return true
  return ga === gb
}

function relayTeamsMatchLoose(
  a: SheetEntry,
  b: SheetEntry,
  athleteGenders?: Map<string, "M" | "F">
): boolean {
  if (a.entryType !== "relay_team" || b.entryType !== "relay_team") return false
  if (relayEventKey(a.event) !== relayEventKey(b.event)) return false
  if (!relayGendersCompatible(a, b, athleteGenders)) return false
  if (!relayRoundsCompatibleForMerge(a, b)) return false

  if (displayRelayLetter(a.relayLetter) !== displayRelayLetter(b.relayLetter)) return false

  return relayEntriesOverlap(a, b)
}

function relaySeedMatchesTeam(
  seed: SheetEntry,
  team: SheetEntry,
  athleteGenders?: Map<string, "M" | "F">
): boolean {
  return relayTeamsMatchLoose(seed, team, athleteGenders)
}

function pickRelayResultMergeTarget(
  candidates: Array<[string, SheetEntry]>
): [string, SheetEntry] | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const prelims = candidates.filter(([, t]) => entryRelayRound(t) === "P")
  if (prelims.length === 1) return prelims[0]

  const finals = candidates.filter(([, t]) => entryRelayRound(t) === "F")
  if (finals.length === 1) return finals[0]

  const timedFinal = candidates.filter(([, t]) => !entryRelayRound(t))
  if (timedFinal.length === 1) return timedFinal[0]

  return null
}

function isRelayTeamMergeTarget(entry: SheetEntry): boolean {
  return (
    entry.entryType === "relay_team" &&
    ((entry.relaySwimmers?.length ?? 0) > 0 || hasRelayResultData(entry))
  )
}

/** Merge psych/heat relay seed rows (no swimmers) onto roster relay rows. */
function relayTeamSeedKey(entry: SheetEntry): string {
  const gender = entry.gender ?? ""
  const letter = normalizeRelayLetter(entry.relayLetter) ?? "A"
  const seed = entry.seedTime ?? entry.timeStatus ?? ""
  return `${relayEventKey(entry.event)}|${gender}|${letter}|${seed}`
}

function relayRosterMatchKeys(entry: SheetEntry): string[] {
  const keys: string[] = []
  const gender = entry.gender ?? ""
  const event = relayEventKey(entry.event)
  const letter = normalizeRelayLetter(entry.relayLetter) ?? "A"
  const seed = entry.seedTime ?? entry.timeStatus ?? ""
  if (seed) keys.push(`${event}|${gender}|seed:${seed}`)
  if (letter) keys.push(`${event}|${gender}|letter:${letter}`)
  if (entry.eventNumber > 0 && letter) {
    keys.push(`${event}|${gender}|event:${entry.eventNumber}|letter:${letter}`)
  }
  return keys
}

function relayEntriesOverlap(a: SheetEntry, b: SheetEntry): boolean {
  const bKeys = new Set(relayRosterMatchKeys(b))
  return relayRosterMatchKeys(a).some((key) => bKeys.has(key))
}

function isRelaySeedOnly(entry: SheetEntry): boolean {
  return entry.entryType === "relay_team" && !entry.relaySwimmers?.length
}

function fuseSheetRelaySeedRows(byKey: Map<string, SheetEntry>): void {
  const teamEntries = [...byKey.entries()].filter(([, entry]) =>
    isRelayTeamMergeTarget(entry)
  )

  for (const [seedKey, seed] of [...byKey.entries()]) {
    if (!isRelaySeedOnly(seed)) continue
    const matches = teamEntries.filter(([, target]) => relaySeedMatchesTeam(seed, target))
    if (matches.length !== 1) continue
    const [targetKey, target] = matches[0]
    if (!byKey.has(seedKey) || !byKey.has(targetKey)) continue
    byKey.set(targetKey, mergeEntries(target, seed))
    byKey.delete(seedKey)
  }

  const remainingSeeds = [...byKey.entries()].filter(([, entry]) => isRelaySeedOnly(entry))
  for (let i = 0; i < remainingSeeds.length; i++) {
    const [keyA, a] = remainingSeeds[i]
    if (!byKey.has(keyA)) continue
    for (let j = i + 1; j < remainingSeeds.length; j++) {
      const [keyB, b] = remainingSeeds[j]
      if (!byKey.has(keyB)) continue
      if (!relayEntriesOverlap(a, b)) continue
      byKey.set(keyA, mergeEntries(a, b))
      byKey.delete(keyB)
    }
  }

  const unmatchedSeeds = [...byKey.entries()].filter(([, entry]) => isRelaySeedOnly(entry))
  const unmatchedRosters = [...byKey.entries()].filter(([, entry]) =>
    isRelayTeamMergeTarget(entry)
  )
  const seedsByEventGender = new Map<string, Array<[string, SheetEntry]>>()
  const rostersByEventGender = new Map<string, Array<[string, SheetEntry]>>()
  for (const item of unmatchedSeeds) {
    const [, entry] = item
    const letter = normalizeRelayLetter(entry.relayLetter) ?? "A"
    const key = `${relayEventKey(entry.event)}|${entry.gender ?? ""}|${letter}`
    seedsByEventGender.set(key, [...(seedsByEventGender.get(key) ?? []), item])
  }
  for (const item of unmatchedRosters) {
    const [, entry] = item
    const letter = normalizeRelayLetter(entry.relayLetter) ?? "A"
    const key = `${relayEventKey(entry.event)}|${entry.gender ?? ""}|${letter}`
    rostersByEventGender.set(key, [...(rostersByEventGender.get(key) ?? []), item])
  }
  for (const [groupKey, seeds] of seedsByEventGender) {
    const rosters = rostersByEventGender.get(groupKey) ?? []
    if (seeds.length !== 1 || rosters.length !== 1) continue
    const [seedKey, seed] = seeds[0]
    const [targetKey, target] = rosters[0]
    if (!byKey.has(seedKey) || !byKey.has(targetKey)) continue
    byKey.set(targetKey, mergeEntries(target, seed))
    byKey.delete(seedKey)
  }
}

/** Merge psych/heat relay seed rows onto imported relay results. */
function fuseRelaySeedWithResults(byKey: Map<string, SheetEntry>): void {
  for (const [seedKey, seed] of [...byKey.entries()]) {
    if (!byKey.has(seedKey)) continue
    if (seed.entryType !== "relay_team" || hasRelayResultData(seed)) continue

    const matches = [...byKey.entries()].filter(
      ([key, target]) =>
        key !== seedKey &&
        target.entryType === "relay_team" &&
        hasRelayResultData(target) &&
        relaySeedMatchesTeam(seed, target)
    )
    const picked = pickRelayResultMergeTarget(matches)
    if (!picked) continue
    const [targetKey, target] = picked
    if (!byKey.has(targetKey)) continue
    byKey.set(targetKey, mergeEntries(target, seed))
    byKey.delete(seedKey)
  }
}

/** Merge imported relay times onto psych/heat rows when relay letter was missing. */
function fuseRelayResultRows(byKey: Map<string, SheetEntry>): void {
  const orphans: Array<[string, SheetEntry]> = []
  for (const [key, entry] of byKey) {
    if (entry.entryType !== "relay_team") continue
    if (entry.relayLetter) continue
    if (!hasRelayResultData(entry)) continue
    orphans.push([key, entry])
  }

  for (const [orphanKey, orphan] of orphans) {
    if (!byKey.has(orphanKey)) continue
    const matches = [...byKey.entries()].filter(
      ([key, entry]) =>
        key !== orphanKey &&
        entry.entryType === "relay_team" &&
        !hasRelayResultData(entry) &&
        relaySeedMatchesTeam(entry, orphan)
    )
    if (matches.length !== 1) continue
    const [targetKey, target] = matches[0]
    byKey.set(targetKey, mergeEntries(target, orphan))
    byKey.delete(orphanKey)
  }
}

function resultKey(
  athleteId: string,
  event: string,
  isLeadoff = false,
  relaySource?: string,
  relayRound?: string
): string {
  if (isLeadoff) {
    return leadoffResultKey(
      athleteId,
      event,
      relaySource,
      (relayRound ?? "") as "P" | "F" | ""
    )
  }
  return `${athleteId}|${normalizeEventName(event)}|individual|`
}

function mergeRelaySwimmers(
  a: SheetEntry["relaySwimmers"],
  b: SheetEntry["relaySwimmers"]
): SheetEntry["relaySwimmers"] {
  if (!a?.length) return b
  if (!b?.length) return a

  const byLeg = new Map<number, NonNullable<SheetEntry["relaySwimmers"]>[number]>()
  for (const leg of a) byLeg.set(leg.leg, { ...leg })
  for (const leg of b) {
    const prev = byLeg.get(leg.leg)
    if (!prev) {
      byLeg.set(leg.leg, leg)
      continue
    }
    const splitTime = sanitizeRelaySplitTime(leg.splitTime) ?? prev.splitTime
    byLeg.set(leg.leg, {
      ...prev,
      ...leg,
      name: leg.name || prev.name,
      athleteId: leg.athleteId ?? prev.athleteId,
      ...(splitTime ? { splitTime } : {}),
    })
  }
  return [...byLeg.values()].sort((x, y) => x.leg - y.leg)
}

function mergedRelayRound(a: SheetEntry, b: SheetEntry): "P" | "F" | "" {
  if (hasRelayResultData(b)) return entryRelayRound(b)
  if (hasRelayResultData(a)) return entryRelayRound(a)
  return a.relayRound || b.relayRound || ""
}

function validHeat(heat?: number): number | undefined {
  return heat != null && heat > 0 ? heat : undefined
}

function mergeHeatFields(a: SheetEntry, b: SheetEntry): Partial<SheetEntry> {
  const patch: Partial<SheetEntry> = {}

  for (const side of [a, b]) {
    const heat = validHeat(side.prelimHeat)
    if (heat != null && patch.prelimHeat == null) patch.prelimHeat = heat
    if (side.prelimLane != null && patch.prelimLane == null) {
      patch.prelimLane = side.prelimLane
    }
    if (side.prelimHeatTotal != null && patch.prelimHeatTotal == null) {
      patch.prelimHeatTotal = side.prelimHeatTotal
    }
    const finalHeat = validHeat(side.finalHeat)
    if (finalHeat != null && patch.finalHeat == null) patch.finalHeat = finalHeat
    if (side.finalLane != null && patch.finalLane == null) {
      patch.finalLane = side.finalLane
    }
    if (side.finalHeatTotal != null && patch.finalHeatTotal == null) {
      patch.finalHeatTotal = side.finalHeatTotal
    }

    const sideHeat = validHeat(side.heat)
    if (sideHeat == null && side.lane == null) continue

    if (isFinalsRound(side.round) || side.relayRound === "F") {
      if (sideHeat != null && patch.finalHeat == null) patch.finalHeat = sideHeat
      if (side.lane != null && patch.finalLane == null) patch.finalLane = side.lane
      if (side.heatTotal != null && patch.finalHeatTotal == null) {
        patch.finalHeatTotal = side.heatTotal
      }
    } else if (isPrelimsRound(side.round) || side.relayRound === "P") {
      if (sideHeat != null && patch.prelimHeat == null) patch.prelimHeat = sideHeat
      if (side.lane != null && patch.prelimLane == null) patch.prelimLane = side.lane
      if (side.heatTotal != null && patch.prelimHeatTotal == null) {
        patch.prelimHeatTotal = side.heatTotal
      }
    } else {
      if (sideHeat != null && patch.heat == null) patch.heat = sideHeat
      if (side.lane != null && patch.lane == null) patch.lane = side.lane
      if (side.heatTotal != null && patch.heatTotal == null) {
        patch.heatTotal = side.heatTotal
      }
    }
  }

  return patch
}

function mergeEntries(a: SheetEntry, b: SheetEntry): SheetEntry {
  const heatPatch = mergeHeatFields(a, b)
  const heatSide =
    a.heat != null && a.heat > 0 ? a : b.heat != null && b.heat > 0 ? b : null
  const psychSide = a.seedRank != null ? a : b.seedRank != null ? b : null
  return {
    ...a,
    ...b,
    ...heatPatch,
    athleteId: a.athleteId,
    athleteName: a.athleteName || b.athleteName,
    event: normalizeEventName(a.event || b.event),
    eventNumber: a.eventNumber || b.eventNumber,
    entryType: a.entryType,
    seedTime: a.seedTime ?? b.seedTime,
    timeStatus: a.timeStatus ?? b.timeStatus,
    seedRank: psychSide?.seedRank ?? a.seedRank ?? b.seedRank,
    heat: heatPatch.heat ?? validHeat(heatSide?.heat) ?? validHeat(a.heat) ?? validHeat(b.heat),
    heatTotal: heatPatch.heatTotal ?? heatSide?.heatTotal ?? a.heatTotal ?? b.heatTotal,
    lane: heatPatch.lane ?? heatSide?.lane ?? a.lane ?? b.lane,
    round: heatSide?.round ?? a.round ?? b.round,
    startTime: heatSide?.startTime ?? a.startTime ?? b.startTime,
    relayLetter: normalizeRelayLetter(a.relayLetter) ?? normalizeRelayLetter(b.relayLetter),
    relayRound: mergedRelayRound(a, b),
    gender: a.gender ?? b.gender,
    relaySwimmers: mergeRelaySwimmers(a.relaySwimmers, b.relaySwimmers),
    resultTime: a.resultTime ?? b.resultTime,
    prelimTime: a.prelimTime ?? b.prelimTime,
    finalTime: a.finalTime ?? b.finalTime,
    relayLeadoffTime: a.relayLeadoffTime ?? b.relayLeadoffTime,
    isRelayLeadoff: a.isRelayLeadoff || b.isRelayLeadoff,
    relayLeadoffSource: a.relayLeadoffSource ?? b.relayLeadoffSource,
    relayLeadoffRound: a.relayLeadoffRound || b.relayLeadoffRound || "",
    resultPlace: a.resultPlace ?? b.resultPlace,
    prelimPlace: a.prelimPlace ?? b.prelimPlace,
    finalPlace: a.finalPlace ?? b.finalPlace,
    resultStatus: a.resultStatus ?? b.resultStatus,
    prelimStatus: a.prelimStatus ?? b.prelimStatus,
    finalStatus: a.finalStatus ?? b.finalStatus,
    resultTags: a.resultTags ?? b.resultTags,
    manual: a.manual || b.manual,
    swimId: a.swimId ?? b.swimId,
    course: a.course ?? b.course,
    date: a.date ?? b.date,
    timeMs: a.timeMs ?? b.timeMs,
  }
}

/** Merge psych + entries + heat summaries, individual results, and relay results into one list. */
export function mergeSheetSummaries(
  psych: SheetSummary | null | undefined,
  heat: SheetSummary | null | undefined,
  results?: MeetResultEntry[] | null,
  relayResults?: SheetEntry[] | null,
  entries?: SheetSummary | null | undefined
): SheetSummary | null {
  const hasSheets = Boolean(psych || heat || entries)
  const hasResults = Boolean(results?.length)
  const hasRelayResults = Boolean(relayResults?.length)
  if (!hasSheets && !hasResults && !hasRelayResults) return null

  const byKey = new Map<string, SheetEntry>()
  for (const entry of [
    ...(psych?.entries ?? []),
    ...(entries?.entries ?? []),
    ...(heat?.entries ?? []),
    ...(relayResults ?? []),
  ]) {
    const key = entryKey(entry)
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergeEntries(existing, entry) : entry)
  }

  fuseSheetRelaySeedRows(byKey)
  fuseRelaySeedWithResults(byKey)
  fuseRelayResultRows(byKey)

  const hasHeatSheet = hasHeatSheetSummary(heat)

  for (const result of results ?? []) {
    const key = resultKey(
      result.athleteId,
      result.event,
      result.isRelayLeadoff,
      result.relayLeadoffSource,
      result.relayLeadoffRound
    )
    const existing = byKey.get(key)
    if (existing) {
      const heatPatch = mergeResultHeatIntoSheetEntry(
        existing,
        result,
        hasHeatSheet
      )
      byKey.set(key, {
        ...existing,
        resultTime: result.resultTime ?? existing.resultTime,
        prelimTime: result.prelimTime ?? existing.prelimTime,
        finalTime: result.finalTime ?? existing.finalTime,
        relayLeadoffTime: result.relayLeadoffTime ?? existing.relayLeadoffTime,
        isRelayLeadoff: result.isRelayLeadoff ?? existing.isRelayLeadoff,
        relayLeadoffSource: result.relayLeadoffSource ?? existing.relayLeadoffSource,
        relayLeadoffRound: result.relayLeadoffRound || existing.relayLeadoffRound || "",
        resultPlace: result.resultPlace ?? existing.resultPlace,
        prelimPlace: result.prelimPlace ?? existing.prelimPlace,
        finalPlace: result.finalPlace ?? existing.finalPlace,
        resultStatus: result.resultStatus ?? existing.resultStatus,
        prelimStatus: result.prelimStatus ?? existing.prelimStatus,
        finalStatus: result.finalStatus ?? existing.finalStatus,
        resultTags: result.resultTags || existing.resultTags,
        ...heatPatch,
        seedTime: existing.seedTime ?? result.seedTime,
        manual: result.manual ?? existing.manual,
        swimId: result.swimId ?? existing.swimId,
        course: result.course ?? existing.course,
        date: result.date ?? existing.date,
        timeMs: result.timeMs ?? existing.timeMs,
      })
    } else {
      byKey.set(key, {
        athleteId: result.athleteId,
        athleteName: result.athleteName,
        event: result.event,
        eventNumber: 0,
        entryType: "individual",
        resultTime: result.resultTime,
        prelimTime: result.prelimTime,
        finalTime: result.finalTime,
        relayLeadoffTime: result.relayLeadoffTime,
        isRelayLeadoff: result.isRelayLeadoff,
        relayLeadoffSource: result.relayLeadoffSource,
        relayLeadoffRound: result.relayLeadoffRound,
        resultPlace: result.resultPlace,
        prelimPlace: result.prelimPlace,
        finalPlace: result.finalPlace,
        resultStatus: result.resultStatus,
        prelimStatus: result.prelimStatus,
        finalStatus: result.finalStatus,
        resultTags: result.resultTags,
        ...resultHeatFieldsFromMeetResult(result),
        seedTime: result.seedTime,
        manual: result.manual,
        swimId: result.swimId,
        course: result.course,
        date: result.date,
        timeMs: result.timeMs,
      })
    }
  }

  return {
    sheetType: heat ? "heat" : "psych",
    course: heat?.course ?? entries?.course ?? psych?.course ?? "SCY",
    entries: [...byKey.values()],
  }
}
