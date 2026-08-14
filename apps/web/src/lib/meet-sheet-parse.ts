import { fetchMeetFileBytes } from "@/lib/meet-file-fetch"
import { parseMeetSheetPdf } from "@/lib/scraper-proxy"
import type { SheetSummary, SheetEntry } from "@/lib/meet-sheet-summary"
import {
  appendSheetSummaryEntries,
  coercePrelimHeatTimedFinalsEntry,
  isSheetSummary,
} from "@/lib/meet-sheet-summary"
import {
  buildAthleteLookup,
  isPairedPdfName,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete-match"
import { collectNameConfirmations } from "@/lib/meet-import"
import {
  assertDocTypeMatches,
  assertMeetNameMatches,
} from "@/lib/meet-import-validate"
import { normalizeEventName } from "@/lib/swim-parse"
import { normalizeRelayLetter } from "@/lib/relay-results"

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
  relaySwimmers?: Array<{ leg: number; name: string; age?: number }>
}

export type CachedSheetParse = {
  sheetType: "psych" | "heat" | "entries"
  course: string
  entries: ParsedSheetEntry[]
  detectedSheetType?: string | null
  meet_name?: string | null
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
}

async function callSheetParser(
  userId: string,
  bytes: Buffer,
  sheetType: "psych" | "heat" | "entries",
  teamCode: string
): Promise<ParsedSheetResult> {
  const allEntries: ParsedSheetEntry[] = []
  let lastResult: Omit<ParsedSheetResult, "entries"> | null = null

  try {
    const result = await parseMeetSheetPdf<ParsedSheetResult>(userId, bytes, {
      sheetType,
      team: teamCode,
    })
    lastResult = {
      sheetType: result.sheetType,
      course: result.course,
      detectedSheetType: result.detectedSheetType,
      meet_name: result.meet_name,
    }
    if (result.entries && result.entries.length > 0) {
      allEntries.push(...result.entries)
    }
  } catch (err) {
    // If team code parsing fails, try without team filter
    const result = await parseMeetSheetPdf<ParsedSheetResult>(userId, bytes, {
      sheetType,
      team: "",
    })
    lastResult = {
      sheetType: result.sheetType,
      course: result.course,
      detectedSheetType: result.detectedSheetType,
      meet_name: result.meet_name,
    }
    allEntries.push(...(result.entries ?? []))
  }

  return {
    sheetType: lastResult?.sheetType ?? sheetType,
    course: lastResult?.course ?? "SCY",
    detectedSheetType: lastResult?.detectedSheetType ?? null,
    meet_name: lastResult?.meet_name ?? null,
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

function collectSheetNames(entries: ParsedSheetEntry[]): string[] {
  const names: string[] = []
  for (const row of entries) {
    if (row.entryType === "individual" && row.name?.trim()) {
      names.push(row.name.trim())
    }
    for (const leg of row.relaySwimmers ?? []) {
      if (leg.name?.trim()) names.push(leg.name.trim())
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

function relaySeedAthleteId(row: ParsedSheetEntry): string {
  const gender = row.gender ?? ""
  const letter = normalizeRelayLetter(row.relayLetter) ?? "A"
  const seed = row.seedTime ?? row.timeStatus ?? ""
  return `relay-seed:${row.eventNumber}:${gender}:${letter}:${seed}`
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
      })
      continue
    }

    if (row.entryType === "relay_team") {
      const relayRound = roundToRelayRound(row.round)
      const gender =
        row.gender === "F" || row.gender === "M" || row.gender === "X"
          ? row.gender
          : undefined

      if (!row.relaySwimmers?.length) {
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
          relayRound,
          gender,
          alternate: row.alternate || undefined,
          relaySwimmers: [],
        })
        continue
      }

      const matchedLegs = row.relaySwimmers
        .map((leg) => {
          const athleteId = matchAthleteIdFast(leg.name, lookup, nameMappings)
          if (!athleteId) return null
          return {
            leg: leg.leg,
            name: leg.name,
            athleteId,
          }
        })
        .filter((leg): leg is NonNullable<typeof leg> => leg !== null)

      if (matchedLegs.length === 0) continue

      const seenAthletes = new Set<string>()
      for (const leg of matchedLegs) {
        if (seenAthletes.has(leg.athleteId)) continue
        seenAthletes.add(leg.athleteId)
        entries.push({
          athleteId: leg.athleteId,
          athleteName: rosterName(leg.athleteId, roster) || leg.name,
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
          relayRound,
          gender,
          alternate: row.alternate || undefined,
          relaySwimmers: matchedLegs,
        })
      }
    }
  }

  return entries
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
  }
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
        await fetchMeetFileBytes(url),
        sheetType,
        teamCode
      )
  validateParsedSheet(sheetType, parsed, options)
  const allEntries = parsed.entries ?? []
  const sheetNames = collectSheetNames(allEntries)
  const filtered = filterParsedEntriesForPairedNames(allEntries, nameMappings)
  let newEntries = matchSheetToRoster(filtered, roster, { nameMappings })
  if (sheetType === "heat") {
    newEntries = newEntries.map(coercePrelimHeatTimedFinalsEntry)
  }
  if (newEntries.length === 0) {
    return {
      summary: existingSummary,
      sheetNames,
      cachedParse: cachedParse ?? undefined,
    }
  }

  return {
    summary: jsonSafeSheetSummary(
      appendSheetSummaryEntries(existingSummary, newEntries)
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
  teamCode: string = "GTSC",
  options?: SheetMatchOptions
): Promise<ParseMeetSheetResult> {
  const bytes = await fetchMeetFileBytes(url)
  const parsed = await callSheetParser(userId, bytes, sheetType, teamCode)
  validateParsedSheet(sheetType, parsed, options)
  const sheetNames = collectSheetNames(parsed.entries ?? [])
  const entries = matchSheetToRoster(parsed.entries ?? [], roster, options)
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
  teamCode: string = "GTSC",
  options?: SheetMatchOptions
): Promise<ParseMeetSheetResult> {
  if (!url) return { summary: null, sheetNames: [] }
  return parseMeetSheetForRoster(userId, url, "psych", roster, teamCode, options)
}

export async function resolveHeatSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string = "GTSC",
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
  teamCode: string = "GTSC",
  options?: SheetMatchOptions,
  cachedByUrl?: Record<string, CachedSheetParse> | null
): Promise<ResolveHeatSheetsResult> {
  if (urls.length === 0) {
    return { summary: null, sheetNames: [], cachedParses: {} }
  }

  let summary: SheetSummary | null = null
  const sheetNames: string[] = []
  const cachedParses: Record<string, CachedSheetParse> = {}

  for (const url of urls) {
    const cached = cachedByUrl?.[url]
    const parsed = cached?.entries
      ? {
          sheetType: cached.sheetType === "entries" ? "heat" : cached.sheetType,
          course: cached.course,
          entries: cached.entries,
          detectedSheetType: cached.detectedSheetType,
          meet_name: cached.meet_name,
        }
      : await callSheetParser(userId, await fetchMeetFileBytes(url), "heat", teamCode)
    validateParsedSheet("heat", parsed, options)
    const allEntries = parsed.entries ?? []
    sheetNames.push(...collectSheetNames(allEntries))
    cachedParses[url] = toCachedSheetParse({ ...parsed, sheetType: "heat" })

    const matched = matchSheetToRoster(allEntries, roster, options).map(
      coercePrelimHeatTimedFinalsEntry
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
    summary: summary ? jsonSafeSheetSummary(summary) : null,
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

  let summary: SheetSummary = existingSummary
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
        }
      : await callSheetParser(
          userId,
          await fetchMeetFileBytes(url),
          "heat",
          teamCode
        )
    validateParsedSheet("heat", parsed, options)
    const allEntries = parsed.entries ?? []
    sheetNames.push(...collectSheetNames(allEntries))
    cachedParses[url] = toCachedSheetParse({ ...parsed, sheetType: "heat" })

    const filtered = filterParsedEntriesForPairedNames(allEntries, nameMappings)
    const newEntries = matchSheetToRoster(filtered, roster, { nameMappings }).map(
      coercePrelimHeatTimedFinalsEntry
    )
    if (newEntries.length === 0) continue
    summary = appendSheetSummaryEntries(summary, newEntries)
  }

  return {
    summary: jsonSafeSheetSummary(summary),
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
  teamCode: string = "GTSC",
  options?: SheetMatchOptions,
  cachedByUrl?: Record<string, CachedSheetParse> | null
): Promise<ResolveFinalsHeatSheetsResult> {
  if (urls.length === 0) {
    return { summary: null, sheetNames: [], cachedParses: {} }
  }

  let summary: SheetSummary | null = null
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
      }
    } else {
      const bytes = await fetchMeetFileBytes(url)
      parsed = await callSheetParser(userId, bytes, "heat", teamCode)
    }
    validateParsedSheet("heat", parsed, options)
    sheetNames.push(...collectSheetNames(parsed.entries ?? []))
    cachedParses[url] = toCachedSheetParse({
      ...parsed,
      sheetType: "heat",
    })

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
    summary: summary ? jsonSafeSheetSummary(summary) : null,
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

  let summary: SheetSummary = existingSummary
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
      }
    } else {
      parsed = await callSheetParser(
        userId,
        await fetchMeetFileBytes(url),
        "heat",
        teamCode
      )
    }
    validateParsedSheet("heat", parsed, options)
    const allEntries = parsed.entries ?? []
    sheetNames.push(...collectSheetNames(allEntries))
    cachedParses[url] = toCachedSheetParse({ ...parsed, sheetType: "heat" })

    const filtered = filterParsedEntriesForPairedNames(allEntries, nameMappings)
    const newEntries = coerceFinalsSheetEntries(
      matchSheetToRoster(filtered, roster, { nameMappings })
    )
    if (newEntries.length === 0) continue
    summary = appendSheetSummaryEntries(summary, newEntries)
  }

  return {
    summary: jsonSafeSheetSummary(summary),
    sheetNames,
    cachedParses,
  }
}

export async function resolveEntriesSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string = "GTSC",
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
