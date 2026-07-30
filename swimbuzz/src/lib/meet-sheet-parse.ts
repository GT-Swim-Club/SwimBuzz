import { fetchMeetFileBytes } from "@/lib/meet-file-fetch"
import { parseMeetSheetPdf } from "@/lib/scraper-or-bridge"
import type { SheetSummary, SheetEntry } from "@/lib/meet-sheet-summary"
import {
  buildAthleteLookup,
  matchAthleteIdFast,
  type RosterAthlete,
} from "@/lib/athlete-match"
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
  relaySwimmers?: Array<{ leg: number; name: string; age?: number }>
}

async function callSheetParser(
  userId: string,
  bytes: Buffer,
  sheetType: "psych" | "heat" | "entries",
  teamCode: string
): Promise<{ sheetType: "psych" | "heat" | "entries"; course: string; entries: ParsedSheetEntry[] }> {
  const allEntries: ParsedSheetEntry[] = []
  let lastResult: { sheetType: "psych" | "heat" | "entries"; course: string } | null = null
  
  try {
    const result = await parseMeetSheetPdf<{
      sheetType: "psych" | "heat" | "entries";
      course: string;
      entries: ParsedSheetEntry[];
    }>(userId, bytes, { sheetType, team: teamCode })
    lastResult = { sheetType: result.sheetType, course: result.course }
    if (result.entries && result.entries.length > 0) {
      allEntries.push(...result.entries)
    }
  } catch (err) {
    // If team code parsing fails, try without team filter
    const result = await parseMeetSheetPdf<{
      sheetType: "psych" | "heat" | "entries";
      course: string;
      entries: ParsedSheetEntry[];
    }>(userId, bytes, { sheetType, team: "" })
    lastResult = { sheetType: result.sheetType, course: result.course }
    allEntries.push(...(result.entries ?? []))
  }
  
  return {
    sheetType: lastResult?.sheetType ?? sheetType,
    course: lastResult?.course ?? "SCY",
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
  if (lower.includes("prelim")) return "P"
  if (lower.includes("final")) return "F"
  return undefined
}

function relaySeedAthleteId(row: ParsedSheetEntry): string {
  const gender = row.gender ?? ""
  const letter = normalizeRelayLetter(row.relayLetter) ?? "A"
  const seed = row.seedTime ?? row.timeStatus ?? ""
  return `relay-seed:${row.eventNumber}:${gender}:${letter}:${seed}`
}

function matchSheetToRoster(
  parsed: ParsedSheetEntry[],
  roster: RosterAthlete[]
): SheetEntry[] {
  const lookup = buildAthleteLookup(roster)
  const entries: SheetEntry[] = []

  for (const row of parsed) {
    const event = normalizeEventName(row.event)
    if (row.entryType === "individual" && row.name) {
      const athleteId = matchAthleteIdFast(row.name, lookup)
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
          relaySwimmers: [],
        })
        continue
      }

      const matchedLegs = row.relaySwimmers
        .map((leg) => {
          const athleteId = matchAthleteIdFast(leg.name, lookup)
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
          relaySwimmers: matchedLegs,
        })
      }
    }
  }

  return entries
}

export async function parseMeetSheetForRoster(
  userId: string,
  url: string,
  sheetType: "psych" | "heat" | "entries",
  roster: RosterAthlete[],
  teamCode: string = "GTSC"
): Promise<SheetSummary | null> {
  const bytes = await fetchMeetFileBytes(url)
  const parsed = await callSheetParser(userId, bytes, sheetType, teamCode)
  const entries = matchSheetToRoster(parsed.entries ?? [], roster)
  if (entries.length === 0) return null
  return jsonSafeSheetSummary({
    sheetType: parsed.sheetType === "entries" ? "psych" : parsed.sheetType,
    course: parsed.course,
    entries,
  })
}

export async function resolvePsychSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string = "GTSC"
): Promise<SheetSummary | null> {
  if (!url) return null
  return parseMeetSheetForRoster(userId, url, "psych", roster, teamCode)
}

export async function resolveHeatSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string = "GTSC"
): Promise<SheetSummary | null> {
  if (!url) return null
  return parseMeetSheetForRoster(userId, url, "heat", roster, teamCode)
}

export async function resolveEntriesSheetSummary(
  userId: string,
  url: string | null | undefined,
  roster: RosterAthlete[],
  teamCode: string = "GTSC"
): Promise<SheetSummary | null> {
  if (!url) return null
  return parseMeetSheetForRoster(userId, url, "entries", roster, teamCode)
}
