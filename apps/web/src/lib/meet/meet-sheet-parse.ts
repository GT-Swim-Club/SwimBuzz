import { parseMeetSheetPdf } from "@/lib/meet/pdf-parser-client"
import type { EventHeats, SheetSummary, SheetEntry } from "@/lib/meet/meet-sheet-summary"
import {
  appendSheetSummaryEntries,
  coercePrelimHeatTimedFinalsEntry,
  isSheetSummary,
  mergeEventHeats,
  relaySeedAthleteId,
  withoutSheetRelayLineups,
} from "@/lib/meet/meet-sheet-summary"
import {
  buildAthleteLookup,
  isPairedPdfName,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete/athlete-match"
import { collectNameConfirmations } from "@/lib/meet/meet-import"
import {
  assertDocTypeMatches,
  assertMeetNameMatches,
} from "@/lib/meet/meet-import-validate"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { normalizeRelayLetter } from "@/lib/meet/relay-results"

/** Prisma JSON columns cannot store `undefined` — omit unset optional fields. */
function jsonSafeSheetSummary(summary: SheetSummary): SheetSummary {
  return JSON.parse(JSON.stringify(summary)) as SheetSummary
}

type ParsedSheetEntry = {
  entryType: "individual" | "relay_team"
  name?: string
  event: string
  eventNumber: number
  seedTime?: string
  timeStatus?: string
  seedRank?: number
  heat?: number
  heatTotal?: number
  lane?: number
  round?: string
  startTime?: string | null
  relayLetter?: string | null
  gender?: "M" | "F" | "X" | ""
  alternate?: boolean
  alternateNumber?: number
  relaySwimmers?: Array<{ leg: number; name: string; age?: number }>
}

export type CachedSheetParse = {
  sheetType: "psych" | "heat" | "entries"
  course: string
  entries: ParsedSheetEntry[]
  detectedSheetType?: string | null
  meet_name?: string | null
  eventHeats?: EventHeats
}

export type CachedSheetParses = Partial<
  Record<"psych" | "entries", CachedSheetParse>
> & {
  heat?: Record<string, CachedSheetParse>
  finals?: Record<string, CachedSheetParse>
}

type ParsedSheetResult = {
  sheetType: "psych" | "heat" | "entries"
  course: string
  entries: ParsedSheetEntry[]
  detectedSheetType?: string | null
  meet_name?: string | null
  /** Heat sheets: every event's heat count, including events with none of our swimmers. */
  eventHeats?: EventHeats
}

async function callSheetParser(
  userId: string,
  url: string,
  sheetType: "psych" | "heat" | "entries",
  teamCode: string
): Promise<ParsedSheetResult> {
  const allEntries: ParsedSheetEntry[] = []
  let lastResult: Omit<ParsedSheetResult, "entries"> | null = null

  try {
    const result = await parseMeetSheetPdf<ParsedSheetResult>(userId, url, {
      sheetType,
      team: teamCode,
    })
    lastResult = {
      sheetType: result.sheetType,
      course: result.course,
      detectedSheetType: result.detectedSheetType,
      meet_name: result.meet_name,
      eventHeats: result.eventHeats,
    }
    if (result.entries && result.entries.length > 0) {
      allEntries.push(...result.entries)
    }
  } catch (err) {
    console.log(`[callSheetParser] team-filtered parse failed, retrying without team: ${err instanceof Error ? err.message : err}`)
    // If team code parsing fails, try without team filter
    const result = await parseMeetSheetPdf<ParsedSheetResult>(userId, url, {
      sheetType,
      team: "",
    })
    lastResult = {
      sheetType: result.sheetType,
      course: result.course,
      detectedSheetType: result.detectedSheetType,
      meet_name: result.meet_name,
      eventHeats: result.eventHeats,
    }
    allEntries.push(...(result.entries ?? []))
  }

  return {
    sheetType: lastResult?.sheetType ?? sheetType,
    course: lastResult?.course ?? "SCY",
    detectedSheetType: lastResult?.detectedSheetType ?? null,
    meet_name: lastResult?.meet_name ?? null,
    ...(lastResult?.eventHeats ? { eventHeats: lastResult.eventHeats } : {}),
    entries: allEntries,
  }
}

function rosterName(athleteId: string, roster: RosterAthlete[]): string {
  const athlete = roster.find((a) => a.id === athleteId)
  return athlete ? `${athlete.lastName}, ${athlete.firstName}` : ""
}

function roundToRelayRound(round?: string): "P" | "F" | undefined {
  if (!round) return undefined
  const lower = round.toLowerCase()
  if (lower.includes("timed") && lower.includes("final")) return undefined
  if (lower.includes("prelim")) return "P"
  if (lower.includes("final")) return "F"
  return undefined
}

export type SheetMatchOptions = {
  nameMappings?: Record<string, string> | null
  rejectedNames?: string[] | null
  cachedSheetParses?: CachedSheetParses | null
  /** Existing meet title — used to soft-match PDF meet names on import. */
  expectedMeetName?: string | null
}

export type ParseMeetSheetResult = {
  summary: SheetSummary | null
  sheetNames: string[]
  cachedParse?: CachedSheetParse
}

/** Individual swimmers' names — relay swimmers aren't imported, so they need no pairing. */
function collectSheetNames(entries: ParsedSheetEntry[]): string[] {
  const names: string[] = []
  for (const row of entries) {
    if (row.entryType === "individual" && row.name?.trim()) {
      names.push(row.name.trim())
    }
  }
  return names
}

function filterParsedEntriesForPairedNames(
  entries: ParsedSheetEntry[],
  nameMappings: Record<string, string>
): ParsedSheetEntry[] {
  if (Object.keys(nameMappings).length === 0) return []
  return entries.filter((row) => {
    if (row.entryType === "individual" && row.name) {
      return isPairedPdfName(row.name, nameMappings)
    }
    if (row.entryType === "relay_team") {
      return (row.relaySwimmers ?? []).some((leg) =>
        isPairedPdfName(leg.name, nameMappings)
      )
    }
    return false
  })
}

function coerceFinalsSheetEntries(entries: SheetEntry[]): SheetEntry[] {
  return entries.map((entry) => {
    const next: SheetEntry = {
      ...entry,
      round: entry.round || "finals",
    }
    if (entry.entryType === "relay_team" && !entry.relayRound) {
      next.relayRound = "F"
    }
    if (
      entry.heat != null &&
      entry.heat > 0 &&
      !entry.alternate &&
      !isFinalsRoundLabel(next.round)
    ) {
      next.round = "finals"
    }
    // Finals meet programs list prelims times under a "Prelims" column (or
    // "Seed Time"). Treat either as the seed for the finals row.
    if (!next.seedTime && !next.timeStatus && entry.prelimTime) {
      next.seedTime = entry.prelimTime
    }
    if (next.seedTime) next.finalsSheetSeedTime = next.seedTime
    if (next.seedRank != null && next.seedRank > 0) {
      next.finalsSheetSeedRank = next.seedRank
    }
    return next
  })
}

function isFinalsRoundLabel(round?: string): boolean {
  const r = (round ?? "").toLowerCase()
  return r === "f" || r === "finals" || r.includes("final")
}

function matchSheetToRoster(
  parsed: ParsedSheetEntry[],
  roster: RosterAthlete[],
  options?: SheetMatchOptions
): SheetEntry[] {
  const lookup = buildAthleteLookup(roster)
  const nameMappings = options?.nameMappings
  const entries: SheetEntry[] = []

  for (const row of parsed) {
    const event = normalizeEventName(row.event)
    if (row.entryType === "individual" && row.name) {
      const athleteId = matchAthleteIdFast(row.name, lookup, nameMappings)
      if (!athleteId) continue
      entries.push({
        athleteId,
        athleteName: rosterName(athleteId, roster) || row.name,
        event,
        eventNumber: row.eventNumber,
        entryType: "individual",
        seedTime: row.seedTime,
        timeStatus: row.timeStatus,
        seedRank: row.seedRank,
        heat: row.heat,
        heatTotal: row.heatTotal,
        lane: row.lane,
        round: row.round,
        startTime: row.startTime,
        alternate: row.alternate || undefined,
        alternateNumber: row.alternateNumber,
      })
      continue
    }

    if (row.entryType === "relay_team") {
      // Lineups come only from the relay builder or results — keep just the team's seed,
      // heat and lane. A listed lineup still has to include one of ours to count as our team.
      if (
        row.relaySwimmers?.length &&
        !row.relaySwimmers.some((leg) => matchAthleteIdFast(leg.name, lookup, nameMappings))
      ) {
        continue
      }
      const gender =
        row.gender === "F" || row.gender === "M" || row.gender === "X"
          ? row.gender
          : undefined
      entries.push({
        athleteId: relaySeedAthleteId(row),
        athleteName: "Relay",
        event,
        eventNumber: row.eventNumber,
        entryType: "relay_team",
        seedTime: row.seedTime,
        timeStatus: row.timeStatus,
        seedRank: row.seedRank,
        heat: row.heat,
        heatTotal: row.heatTotal,
        lane: row.lane,
        round: row.round,
        startTime: row.startTime,
        relayLetter: normalizeRelayLetter(row.relayLetter),
        relayRound: roundToRelayRound(row.round),
        gender,
        alternate: row.alternate || undefined,
        alternateNumber: row.alternateNumber,
        relaySwimmers: [],
      })
    }
  }

  return entries
}

/** Flag entries-report rows so the sign-up seed cleanup doesn't mistake them for manual seeds. */
function markEntriesImport(
  sheetType: "psych" | "heat" | "entries",
  entries: SheetEntry[]
): SheetEntry[] {
  if (sheetType !== "entries") return entries
  return entries.map((entry) => ({ ...entry, entriesImport: true }))
}

function validateParsedSheet(
  sheetType: "psych" | "heat" | "entries",
  parsed: {
    detectedSheetType?: string | null
    meet_name?: string | null
  },
  options?: SheetMatchOptions
) {
  assertDocTypeMatches(sheetType, parsed.detectedSheetType)
  assertMeetNameMatches(options?.expectedMeetName, parsed.meet_name, "PDF")
}

function toCachedSheetParse(parsed: ParsedSheetResult): CachedSheetParse {
  return {
    sheetType: parsed.sheetType === "entries" ? "entries" : parsed.sheetType,
    course: parsed.course,
    entries: parsed.entries ?? [],
    detectedSheetType: parsed.detectedSheetType ?? null,
    meet_name: parsed.meet_name ?? null,
    ...(parsed.eventHeats ? { eventHeats: parsed.eventHeats } : {}),
  }
}

/** A heat sheet summary with its sheets' heat counts, when it has any. */
function withEventHeats(summary: SheetSummary, eventHeats: EventHeats): SheetSummary {
  return Object.keys(eventHeats).length > 0 ? { ...summary, eventHeats } : summary
}

export async function applyPairedSheetEntries(
  userId: string,
  url: string,
  sheetType: "psych" | "heat" | "entries",
  roster: RosterAthlete[],
  teamCode: string,
  existingSummary: unknown,
  nameMappings: Record<string, string>,
  cachedParse?: CachedSheetParse | null,
  options?: SheetMatchOptions
): Promise<ParseMeetSheetResult> {
  if (!isSheetSummary(existingSummary)) {
    if (sheetType === "heat") {
      return resolveHeatSheetSummary(userId, url, roster, teamCode, {
        ...options,
        nameMappings,
      })
    }
    return parseMeetSheetForRoster(userId, url, sheetType, roster, teamCode, {
      ...options,
      nameMappings,
    })
  }

  const parsed = cachedParse?.entries
    ? {
        sheetType: cachedParse.sheetType,
        course: cachedParse.course,
        entries: cachedParse.entries,
        detectedSheetType: cachedParse.detectedSheetType,
        meet_name: cachedParse.meet_name,
      }
    : await callSheetParser(
        userId,
        url,
        sheetType,
        teamCode
      )
  validateParsedSheet(sheetType, parsed, options)
  const allEntries = parsed.entries ?? []
  const sheetNames = collectSheetNames(allEntries)
  const filtered = filterParsedEntriesForPairedNames(allEntries, nameMappings)
  let newEntries = markEntriesImport(
    sheetType,
    matchSheetToRoster(filtered, roster, { nameMappings })
  )
  if (sheetType === "heat") {
    newEntries = newEntries.map(coercePrelimHeatTimedFinalsEntry)
  }
  // Drop relay lineups stored by earlier imports along the way.
  const existing = withoutSheetRelayLineups(existingSummary)
  if (newEntries.length === 0) {
    return {
      summary: existing,
      sheetNames,
      cachedParse: cachedParse ?? undefined,
    }
  }

  return {
    summary: jsonSafeSheetSummary(
      appendSheetSummaryEntries(existing, newEntries)
    ),
    sheetNames,
    cachedParse: toCachedSheetParse({
      ...parsed,
      entries: allEntries,
    }),
  }
}

export async function parseMeetSheetForRoster(
  userId: string,
  url: string,
  sheetType: "psych" | "heat" | "entries",
  roster: RosterAthlete[],
  teamCode: string,
  options?: SheetMatchOptions
): Promise<ParseMeetSheetResult> {
  const parsed = await callSheetParser(userId, url, sheetType, teamCode)
  validateParsedSheet(sheetType, parsed, options)
  const sheetNames = collectSheetNames(parsed.entries ?? [])
  const entries = markEntriesImport(
    sheetType,
    matchSheetToRoster(parsed.entries ?? [], roster, options)
  )
  const cachedParse = toCachedSheetParse(parsed)
  if (entries.length === 0) {
    return { summary: null, sheetNames, cachedParse }
  }
  return {
    summary: jsonSafeSheetSummary({
      sheetType: parsed.sheetType === "entries" ? "psych" : parsed.sheetType,
      course: parsed.course,
      entries,
    }),
    sheetNames,
    cachedParse,
  }
}

export async function resolvePsychSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string,
  options?: SheetMatchOptions
): Promise<ParseMeetSheetResult> {
  if (!url) return { summary: null, sheetNames: [] }
  return parseMeetSheetForRoster(userId, url, "psych", roster, teamCode, options)
}

export async function resolveHeatSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string,
  options?: SheetMatchOptions
): Promise<ParseMeetSheetResult> {
  if (!url) return { summary: null, sheetNames: [] }
  const result = await parseMeetSheetForRoster(
    userId,
    url,
    "heat",
    roster,
    teamCode,
    options
  )
  if (!result.summary) return result
  return {
    ...result,
    summary: {
      ...result.summary,
      entries: result.summary.entries.map(coercePrelimHeatTimedFinalsEntry),
    },
  }
}

export type ResolveHeatSheetsResult = {
  summary: SheetSummary | null
  sheetNames: string[]
  cachedParses: Record<string, CachedSheetParse>
}

/** Parse and merge multiple prelim heat sheet PDFs into one summary. */
export async function resolveHeatSheetSummaries(
  userId: string,
  urls: string[],
  roster: RosterAthlete[],
  teamCode: string,
  options?: SheetMatchOptions,
  cachedByUrl?: Record<string, CachedSheetParse> | null
): Promise<ResolveHeatSheetsResult> {
  if (urls.length === 0) {
    return { summary: null, sheetNames: [], cachedParses: {} }
  }

  let summary: SheetSummary | null = null
  let eventHeats: EventHeats = {}
  const sheetNames: string[] = []
  const cachedParses: Record<string, CachedSheetParse> = {}

  for (const url of urls) {
    const cached = cachedByUrl?.[url]
    const parseStart = Date.now()
    const parsed = cached?.entries
      ? {
          sheetType: cached.sheetType === "entries" ? "heat" : cached.sheetType,
          course: cached.course,
          entries: cached.entries,
          detectedSheetType: cached.detectedSheetType,
          meet_name: cached.meet_name,
          eventHeats: cached.eventHeats,
        }
      : await callSheetParser(userId, url, "heat", teamCode)
    console.log(`[resolveHeatSheetSummaries] callSheetParser ${cached?.entries ? "(cached)" : ""} in ${Date.now() - parseStart}ms`)
    validateParsedSheet("heat", parsed, options)
    const allEntries = parsed.entries ?? []
    sheetNames.push(...collectSheetNames(allEntries))
    cachedParses[url] = toCachedSheetParse({ ...parsed, sheetType: "heat" })
    eventHeats = mergeEventHeats(eventHeats, parsed.eventHeats)

    const matchStart = Date.now()
    const matched = matchSheetToRoster(allEntries, roster, options).map(
      coercePrelimHeatTimedFinalsEntry
    )
    console.log(`[resolveHeatSheetSummaries] matchSheetToRoster (${allEntries.length} entries x ${roster.length} roster) in ${Date.now() - matchStart}ms`)
    if (matched.length === 0) continue

    const nextSummary: SheetSummary = {
      sheetType: "heat",
      course: parsed.course,
      entries: matched,
    }
    summary = summary
      ? appendSheetSummaryEntries(summary, matched)
      : jsonSafeSheetSummary(nextSummary)
  }

  return {
    summary: summary ? jsonSafeSheetSummary(withEventHeats(summary, eventHeats)) : null,
    sheetNames,
    cachedParses,
  }
}

export async function applyPairedHeatSheetEntries(
  userId: string,
  urls: string[],
  roster: RosterAthlete[],
  teamCode: string,
  existingSummary: unknown,
  nameMappings: Record<string, string>,
  cachedByUrl?: Record<string, CachedSheetParse> | null,
  options?: SheetMatchOptions
): Promise<ResolveHeatSheetsResult> {
  if (!isSheetSummary(existingSummary)) {
    return resolveHeatSheetSummaries(
      userId,
      urls,
      roster,
      teamCode,
      { ...options, nameMappings },
      cachedByUrl
    )
  }

  // Drop relay lineups stored by earlier imports along the way.
  let summary: SheetSummary = withoutSheetRelayLineups(existingSummary)
  let eventHeats: EventHeats = {}
  const sheetNames: string[] = []
  const cachedParses: Record<string, CachedSheetParse> = {}

  for (const url of urls) {
    const cached = cachedByUrl?.[url]
    const parsed = cached?.entries
      ? {
          sheetType: "heat" as const,
          course: cached.course,
          entries: cached.entries,
          detectedSheetType: cached.detectedSheetType,
          meet_name: cached.meet_name,
          eventHeats: cached.eventHeats,
        }
      : await callSheetParser(userId, url, "heat", teamCode)
    validateParsedSheet("heat", parsed, options)
    const allEntries = parsed.entries ?? []
    sheetNames.push(...collectSheetNames(allEntries))
    cachedParses[url] = toCachedSheetParse({ ...parsed, sheetType: "heat" })
    eventHeats = mergeEventHeats(eventHeats, parsed.eventHeats)

    const filtered = filterParsedEntriesForPairedNames(allEntries, nameMappings)
    const newEntries = matchSheetToRoster(filtered, roster, { nameMappings }).map(
      coercePrelimHeatTimedFinalsEntry
    )
    if (newEntries.length === 0) continue
    summary = appendSheetSummaryEntries(summary, newEntries)
  }

  return {
    summary: jsonSafeSheetSummary(withEventHeats(summary, eventHeats)),
    sheetNames,
    cachedParses,
  }
}

export type ResolveFinalsHeatSheetsResult = {
  summary: SheetSummary | null
  sheetNames: string[]
  cachedParses: Record<string, CachedSheetParse>
}

/** Parse and merge multiple finals heat sheet PDFs into one summary. */
export async function resolveFinalsHeatSheetSummaries(
  userId: string,
  urls: string[],
  roster: RosterAthlete[],
  teamCode: string,
  options?: SheetMatchOptions,
  cachedByUrl?: Record<string, CachedSheetParse> | null
): Promise<ResolveFinalsHeatSheetsResult> {
  if (urls.length === 0) {
    return { summary: null, sheetNames: [], cachedParses: {} }
  }

  let summary: SheetSummary | null = null
  let eventHeats: EventHeats = {}
  const sheetNames: string[] = []
  const cachedParses: Record<string, CachedSheetParse> = {}

  for (const url of urls) {
    const cached = cachedByUrl?.[url]
    let parsed: ParsedSheetResult
    if (cached?.entries) {
      parsed = {
        sheetType: cached.sheetType === "entries" ? "heat" : cached.sheetType,
        course: cached.course,
        entries: cached.entries,
        detectedSheetType: cached.detectedSheetType,
        meet_name: cached.meet_name,
        eventHeats: cached.eventHeats,
      }
    } else {
      parsed = await callSheetParser(userId, url, "heat", teamCode)
    }
    validateParsedSheet("heat", parsed, options)
    sheetNames.push(...collectSheetNames(parsed.entries ?? []))
    cachedParses[url] = toCachedSheetParse({
      ...parsed,
      sheetType: "heat",
    })
    eventHeats = mergeEventHeats(eventHeats, parsed.eventHeats)

    const matched = coerceFinalsSheetEntries(
      matchSheetToRoster(parsed.entries ?? [], roster, options)
    )
    if (matched.length === 0) continue

    const nextSummary: SheetSummary = {
      sheetType: "heat",
      course: parsed.course,
      entries: matched,
    }
    summary = summary
      ? appendSheetSummaryEntries(summary, matched)
      : jsonSafeSheetSummary(nextSummary)
  }

  return {
    summary: summary ? jsonSafeSheetSummary(withEventHeats(summary, eventHeats)) : null,
    sheetNames,
    cachedParses,
  }
}

export async function applyPairedFinalsHeatSheetEntries(
  userId: string,
  urls: string[],
  roster: RosterAthlete[],
  teamCode: string,
  existingSummary: unknown,
  nameMappings: Record<string, string>,
  cachedByUrl?: Record<string, CachedSheetParse> | null,
  options?: SheetMatchOptions
): Promise<ResolveFinalsHeatSheetsResult> {
  if (!isSheetSummary(existingSummary)) {
    return resolveFinalsHeatSheetSummaries(
      userId,
      urls,
      roster,
      teamCode,
      { ...options, nameMappings },
      cachedByUrl
    )
  }

  // Drop relay lineups stored by earlier imports along the way.
  let summary: SheetSummary = withoutSheetRelayLineups(existingSummary)
  let eventHeats: EventHeats = {}
  const sheetNames: string[] = []
  const cachedParses: Record<string, CachedSheetParse> = {}

  for (const url of urls) {
    const cached = cachedByUrl?.[url]
    let parsed: ParsedSheetResult
    if (cached?.entries) {
      parsed = {
        sheetType: "heat",
        course: cached.course,
        entries: cached.entries,
        detectedSheetType: cached.detectedSheetType,
        meet_name: cached.meet_name,
        eventHeats: cached.eventHeats,
      }
    } else {
      parsed = await callSheetParser(userId, url, "heat", teamCode)
    }
    validateParsedSheet("heat", parsed, options)
    const allEntries = parsed.entries ?? []
    sheetNames.push(...collectSheetNames(allEntries))
    cachedParses[url] = toCachedSheetParse({ ...parsed, sheetType: "heat" })
    eventHeats = mergeEventHeats(eventHeats, parsed.eventHeats)

    const filtered = filterParsedEntriesForPairedNames(allEntries, nameMappings)
    const newEntries = coerceFinalsSheetEntries(
      matchSheetToRoster(filtered, roster, { nameMappings })
    )
    if (newEntries.length === 0) continue
    summary = appendSheetSummaryEntries(summary, newEntries)
  }

  return {
    summary: jsonSafeSheetSummary(withEventHeats(summary, eventHeats)),
    sheetNames,
    cachedParses,
  }
}

export async function resolveEntriesSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string,
  options?: SheetMatchOptions
): Promise<ParseMeetSheetResult> {
  if (!url) return { summary: null, sheetNames: [] }
  return parseMeetSheetForRoster(userId, url, "entries", roster, teamCode, options)
}

export function collectSheetNameConfirmations(
  sheetNames: string[],
  roster: RosterAthlete[],
  options?: SheetMatchOptions
) {
  const lookup = buildAthleteLookup(roster)
  const nameConfirmations = collectNameConfirmations(
    sheetNames,
    roster,
    lookup,
    options?.nameMappings,
    options?.rejectedNames
  )
  const rosterForPairing =
    nameConfirmations.length > 0
      ? roster
          .map((a) => ({
            id: a.id,
            firstName: a.firstName,
            lastName: a.lastName,
          }))
          .sort(
            (a, b) =>
              a.lastName.localeCompare(b.lastName) ||
              a.firstName.localeCompare(b.firstName)
          )
      : []
  return { nameConfirmations, rosterForPairing }
}
