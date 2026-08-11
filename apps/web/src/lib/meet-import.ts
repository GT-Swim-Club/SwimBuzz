import { prisma } from "@/lib/prisma"
import {
  buildAthleteLookup,
  findNearMatchAthlete,
  isAutomaticallyMatched,
  isPairedPdfName,
  isRejectedPdfName,
  matchAthleteIdFast,
  nameMatchKey,
  type RosterAthlete,
} from "@/lib/athlete-match"
import { assignSwimOccurrences } from "@/lib/swim-dedup"
import { parseCourse, parseMeetDate, parseSwimStatus, parseSwimTime, normalizeEventName } from "@/lib/swim-parse"
import {
  matchRelayResultsToRoster,
  isRealRelaySwimmerName,
  isRelayLeadoffSwimTag,
  isRelayResultsSummary,
  preserveRelayEntryFields,
  relayTeamKey,
  effectiveRelayRound,
  type ParsedRelayResult,
} from "@/lib/relay-results"
import { importRelayLeadoffSwims } from "@/lib/relay-leadoff-sync"
import {
  buildHeatSheetLookup,
  isResultStatusesSummary,
  isSheetSummary,
  mergeMeetResultEntries,
  placementsToMeetResults,
  resultKey,
  seedsToMeetResults,
  splitsToMeetResults,
  statusesToMeetResults,
  type MeetResultEntry,
} from "@/lib/meet-sheet-summary"
import { isEditableSignupSheetSeed } from "@/lib/meet-signup"
import { Prisma } from "@prisma/client"

export type ParsedMeetResult = {
  name: string
  event: string
  time: string
  course: string
  tags?: string
  date?: string
  place?: number
  heat?: number
  lane?: number
  heatTotal?: number
  seedTime?: string
  splits?: Array<{ distance: number; splitTime: string }>
}

export type NameConfirmation = {
  pdfName: string
  /** Near-match suggestion when available; coach may pick any roster athlete. */
  athleteId?: string
  athleteName?: string
  occurrences: number
}

export type RosterPairingOption = {
  id: string
  firstName: string
  lastName: string
}

export type MeetImportSummary = {
  imported: number
  parsed: number
  matched: number
  unmatched: ParsedMeetResult[]
  unmatchedCount: number
  skippedInvalid: number
  relayResultsMatched: number
  leadoffsImported: number
  statusesMatched: number
  nameConfirmations: NameConfirmation[]
  /** Season roster for the coach pairing UI (only when confirmations exist). */
  rosterForPairing: RosterPairingOption[]
}

export function collectNameConfirmations(
  names: string[],
  roster: RosterAthlete[],
  lookup: ReturnType<typeof buildAthleteLookup>,
  nameMappings: Record<string, string> | null | undefined,
  rejectedNames: string[] | null | undefined
): NameConfirmation[] {
  const counts = new Map<string, { pdfName: string; count: number }>()
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    if (matchAthleteIdFast(name, lookup, nameMappings)) continue
    if (isRejectedPdfName(name, rejectedNames)) continue
    const key = nameMatchKey(name) ?? name.toLowerCase()
    const prev = counts.get(key)
    if (prev) prev.count += 1
    else counts.set(key, { pdfName: name, count: 1 })
  }

  const out: NameConfirmation[] = []
  for (const { pdfName, count } of counts.values()) {
    const near = findNearMatchAthlete(pdfName, roster)
    out.push({
      pdfName,
      athleteId: near?.athleteId,
      athleteName: near
        ? `${near.firstName} ${near.lastName}`
        : undefined,
      occurrences: count,
    })
  }
  out.sort((a, b) => a.pdfName.localeCompare(b.pdfName))
  return out
}

export async function importMeetResults({
  season,
  meetName,
  meetDate,
  results,
  relayResults = [],
  source,
  courseDefault = "SCY",
  meetId = null,
  nameMappings = null,
  rejectedNames = null,
  pairOnly = false,
  allResults = null,
  allRelayResults = null,
}: {
  season: string
  meetName: string
  meetDate: Date
  results: ParsedMeetResult[]
  relayResults?: ParsedRelayResult[]
  source: string
  courseDefault?: string
  meetId?: string | null
  /** Coach-confirmed PDF name → athlete id (typo fixes). */
  nameMappings?: Record<string, string> | null
  /** PDF names the coach said are not the suggested roster athlete. */
  rejectedNames?: string[] | null
  /** When true, only import rows for coach-paired names (re-import after pairing). */
  pairOnly?: boolean
  /** Full parsed result set for unmatched-name detection when pairOnly. */
  allResults?: ParsedMeetResult[] | null
  allRelayResults?: ParsedRelayResult[] | null
}): Promise<MeetImportSummary> {
  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: { id: true, firstName: true, lastName: true, nicknames: true },
  })

  const lookup = buildAthleteLookup(roster)
  const athleteById = new Map(
    roster.map((a) => [a.id, `${a.lastName}, ${a.firstName}`])
  )

  const resultsForConfirm = allResults ?? results
  const relayResultsForConfirm = allRelayResults ?? relayResults

  const activeResults =
    pairOnly && nameMappings
      ? results.filter(
          (row) =>
            isPairedPdfName(row.name, nameMappings) &&
            !isAutomaticallyMatched(row.name, lookup)
        )
      : results

  const activeRelayResults =
    pairOnly && nameMappings
      ? relayResults.filter((relay) =>
          (relay.relaySwimmers ?? []).some(
            (leg) =>
              isPairedPdfName(leg.name, nameMappings) &&
              !isAutomaticallyMatched(leg.name, lookup)
          )
        )
      : relayResults

  const namesForConfirm: string[] = []
  for (const row of resultsForConfirm) {
    if (isRelayLeadoffSwimTag(row.tags ?? "")) continue
    if (!isRealRelaySwimmerName(row.name)) continue
    namesForConfirm.push(row.name)
  }
  for (const relay of relayResultsForConfirm) {
    for (const leg of relay.relaySwimmers ?? []) {
      if (isRealRelaySwimmerName(leg.name)) namesForConfirm.push(leg.name)
    }
  }
  const nameConfirmations = collectNameConfirmations(
    namesForConfirm,
    roster,
    lookup,
    nameMappings,
    rejectedNames
  )
  const rosterForPairing: RosterPairingOption[] =
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

  const meetRecord = meetId
    ? await prisma.meet.findUnique({
        where: { id: meetId },
        select: {
          heatSheetSummary: true,
          finalsHeatSheetSummary: true,
          resultStatusesSummary: true,
          relayResultsSummary: true,
          entriesSheetSummary: true,
        },
      })
    : null
  const heatSheetSummary = isSheetSummary(meetRecord?.heatSheetSummary)
    ? meetRecord.heatSheetSummary
    : null
  const finalsHeatSheetSummary = isSheetSummary(meetRecord?.finalsHeatSheetSummary)
    ? meetRecord.finalsHeatSheetSummary
    : null
  const heatSheetLookup = buildHeatSheetLookup(
    heatSheetSummary && finalsHeatSheetSummary
      ? {
          ...heatSheetSummary,
          entries: [
            ...heatSheetSummary.entries,
            ...finalsHeatSheetSummary.entries,
          ],
        }
      : heatSheetSummary ?? finalsHeatSheetSummary
  )

  const swims: {
    athleteId: string
    event: string
    timeMs: number
    course: ReturnType<typeof parseCourse>
    date: Date
    meet: string
    meetId: string | null
    tags: string
    place: number | null
    source: string
  }[] = []

  const unmatched: ParsedMeetResult[] = []
  const matched: {
    sourceName: string
    athlete: string
    event: string
    time: string
    course: string
  }[] = []
  let skippedInvalid = 0
  const swimDates = new Set<string>()
  const statusRows: {
    athleteId: string
    athleteName: string
    event: string
    status: string
    tags: string
  }[] = []
  const placementRows: {
    athleteId: string
    athleteName: string
    event: string
    tags: string
    heat?: number
    lane?: number
    heatTotal?: number
  }[] = []
  const seedRows: {
    athleteId: string
    athleteName: string
    event: string
    seedTime: string
  }[] = []
  const splitRows: {
    athleteId: string
    athleteName: string
    event: string
    tags: string
    splits: Array<{ distance: number; splitTime: string }>
  }[] = []

  function pushPlacementRow(
    row: (typeof placementRows)[number]
  ): void {
    if ((row.heat == null || row.heat < 1) && row.lane == null) return
    placementRows.push(row)
  }

  for (const row of activeResults) {
    // Relay leadoffs are synced from leg-1 relay splits, not individual result rows.
    if (isRelayLeadoffSwimTag(row.tags ?? "")) continue

    const athleteId = matchAthleteIdFast(row.name, lookup, nameMappings)
    const event = normalizeEventName(row.event)
    const timeMs = parseSwimTime(row.time)
    const status = parseSwimStatus(row.time)

    if (!athleteId || !event) {
      if (!athleteId) unmatched.push(row)
      else skippedInvalid++
      continue
    }

    if (!pairOnly && source === "swimphone" && nameMappings && isAutomaticallyMatched(row.name, lookup)) {
      continue
    }

    const seedTime = row.seedTime?.trim()
    if (seedTime && parseSwimTime(seedTime)) {
      seedRows.push({
        athleteId,
        athleteName: athleteById.get(athleteId) ?? row.name,
        event,
        seedTime,
      })
    }

    const rowSplits = (row.splits ?? [])
      .map((s) => ({
        distance: Number(s.distance),
        splitTime: String(s.splitTime ?? "").trim(),
      }))
      .filter((s) => Number.isFinite(s.distance) && s.distance > 0 && Boolean(parseSwimTime(s.splitTime)))
    if (rowSplits.length > 0) {
      splitRows.push({
        athleteId,
        athleteName: athleteById.get(athleteId) ?? row.name,
        event,
        tags: row.tags ?? "",
        splits: rowSplits,
      })
    }

    if (status) {
      statusRows.push({
        athleteId,
        athleteName: athleteById.get(athleteId) ?? row.name,
        event,
        status,
        tags: row.tags ?? "",
      })
      const heat = row.heat != null && row.heat > 0 ? row.heat : undefined
      const lane = row.lane != null ? row.lane : undefined
      if (heat != null || lane != null) {
        pushPlacementRow({
          athleteId,
          athleteName: athleteById.get(athleteId) ?? row.name,
          event,
          tags: row.tags ?? "",
          heat,
          lane,
          heatTotal: row.heatTotal,
        })
      }
      continue
    }

    if (!timeMs) {
      skippedInvalid++
      continue
    }

    const course = parseCourse(event, row.course || courseDefault)
    matched.push({
      sourceName: row.name,
      athlete: athleteById.get(athleteId) ?? athleteId,
      event,
      time: row.time,
      course,
    })

    // Prefer the actual day the swim happened (scraped per-event) so multi-day
    // meets date each swim correctly; fall back to the meet's start date.
    const rowDate = (row.date ? parseMeetDate(row.date) : null) ?? meetDate
    swimDates.add(rowDate.toISOString())

    swims.push({
      athleteId,
      event,
      timeMs,
      course,
      date: rowDate,
      meet: meetName,
      meetId,
      tags: row.tags ?? "",
      place: row.place ?? null,
      source,
    })

    const heat = row.heat != null && row.heat > 0 ? row.heat : undefined
    const lane = row.lane != null ? row.lane : undefined
    if (heat != null || lane != null) {
      pushPlacementRow({
        athleteId,
        athleteName: athleteById.get(athleteId) ?? row.name,
        event,
        tags: row.tags ?? "",
        heat,
        lane,
        heatTotal: row.heatTotal,
      })
    }
  }

  const swimsToInsert = assignSwimOccurrences(swims)
  const result = await prisma.swim.createMany({
    data: swimsToInsert,
    skipDuplicates: true,
  })

  // Re-imports skip duplicate rows — still refresh finish place when provided.
  const swimsWithPlace = swimsToInsert.filter((s) => s.place != null && s.place > 0)
  if (swimsWithPlace.length > 0 && result.count < swimsToInsert.length) {
    const PLACE_UPDATE_BATCH = 5
    for (let i = 0; i < swimsWithPlace.length; i += PLACE_UPDATE_BATCH) {
      const batch = swimsWithPlace.slice(i, i + PLACE_UPDATE_BATCH)
      await Promise.all(
        batch.map((swim) =>
          prisma.swim.updateMany({
            where: {
              athleteId: swim.athleteId,
              event: swim.event,
              timeMs: swim.timeMs,
              course: swim.course,
              date: swim.date,
              tags: swim.tags,
              occurrence: swim.occurrence,
            },
            data: { place: swim.place },
          })
        )
      )
    }
  }

  const relayEntries = matchRelayResultsToRoster(activeRelayResults, roster, nameMappings).map(
    (entry) => {
      const sheetEntry = heatSheetLookup.get(
        relayTeamKey(
          entry.event,
          entry.relayLetter,
          entry.relayRound ?? "",
          entry.gender ?? ""
        )
      )
      return sheetEntry
        ? preserveRelayEntryFields(entry, sheetEntry)
        : entry
    }
  )
  const courseForLeadoffs = parseCourse("", courseDefault)
  const leadoffsImported = await importRelayLeadoffSwims({
    meetName,
    meetId,
    meetDate,
    course: courseForLeadoffs,
    relayResults: pairOnly
      ? activeRelayResults
      : nameMappings && source === "swimphone"
        ? relayResults.filter((relay) => {
            const leg1 = relay.relaySwimmers?.find((s) => s.leg === 1)
            return !leg1 || !isAutomaticallyMatched(leg1.name, lookup)
          })
        : activeRelayResults,
    roster,
    source,
    nameMappings,
  })
  const statusEntries = statusesToMeetResults(statusRows)
  const placementEntries = placementsToMeetResults(placementRows)
  const seedEntries = seedsToMeetResults(seedRows)
  const splitEntries = splitsToMeetResults(splitRows)
  const existingMeta = isResultStatusesSummary(meetRecord?.resultStatusesSummary)
    ? meetRecord.resultStatusesSummary.entries
    : []

  const parsedResultsKeys = new Set(
    activeResults.map((r) => {
      const athleteId = matchAthleteIdFast(r.name, lookup, nameMappings)
      if (!athleteId) return null
      const event = normalizeEventName(r.event)
      return resultKey(athleteId, event, false)
    }).filter(Boolean)
  )

  const filteredExistingMeta = pairOnly
    ? existingMeta
    : existingMeta.filter((entry) => {
        if (!entry.manual) return true
        const key = resultKey(
          entry.athleteId,
          entry.event,
          !!entry.isRelayLeadoff,
          entry.relayLeadoffSource,
          entry.relayLeadoffRound
        )
        return parsedResultsKeys.has(key)
      })

  const metaEntries = mergeMeetResultEntries(
    filteredExistingMeta,
    statusEntries,
    seedEntries,
    placementEntries,
    splitEntries
  )
  if (meetId) {
    const meetUpdate: {
      relayResultsSummary?: { entries: typeof relayEntries }
      resultStatusesSummary?: { entries: MeetResultEntry[] }
      entriesSheetSummary?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
    } = {}
    if (relayEntries.length > 0) {
      const existingRelays = isRelayResultsSummary(meetRecord?.relayResultsSummary)
        ? meetRecord.relayResultsSummary.entries
        : []
      const importedKeys = new Set(
        relayEntries.map((e) =>
          relayTeamKey(
            e.event,
            e.relayLetter,
            e.relayRound ?? "",
            e.gender ?? ""
          )
        )
      )
      const leftoverManual = existingRelays.filter((e) => {
        if (e.entryType !== "relay_team" || !e.manual) return false
        const key = relayTeamKey(
          e.event,
          e.relayLetter,
          effectiveRelayRound(e),
          e.gender ?? ""
        )
        return !importedKeys.has(key)
      })
      const keptExisting = pairOnly
        ? existingRelays.filter((e) => {
            const key = relayTeamKey(
              e.event,
              e.relayLetter,
              effectiveRelayRound(e),
              e.gender ?? ""
            )
            return !importedKeys.has(key)
          })
        : []
      meetUpdate.relayResultsSummary = {
        entries: [...keptExisting, ...relayEntries, ...leftoverManual],
      }
    }
    if (metaEntries.length > 0) {
      meetUpdate.resultStatusesSummary = { entries: metaEntries }
    }

    // Strip manual/signup-synced individual entries from the roster summary
    // when results (or any sheet) are imported — the authoritative sheet data
    // takes precedence over manually-added or sign-up-synced seeds.
    if (isSheetSummary(meetRecord?.entriesSheetSummary)) {
      const filteredEntries = meetRecord.entriesSheetSummary.entries.filter(
        (e) => !isEditableSignupSheetSeed(e)
      )
      meetUpdate.entriesSheetSummary = JSON.parse(
        JSON.stringify({ ...meetRecord.entriesSheetSummary, entries: filteredEntries })
      ) as Prisma.InputJsonValue
    }

    await prisma.meet.update({
      where: { id: meetId },
      data: meetUpdate,
    })
  }

  // Link any pre-existing (duplicate) swims from this meet so re-imports still
  // attach to the meet dashboard.
  if (meetId) {
    const dates = [...swimDates].map((iso) => new Date(iso))
    await prisma.swim.updateMany({
      where: {
        meetId: null,
        meet: meetName,
        date: { in: dates.length > 0 ? dates : [meetDate] },
      },
      data: { meetId },
    })
  }

  console.log(
    `\n--- Meet import (${source}): ${meetName} (${matched.length} matched, ${unmatched.length} unmatched) ---`
  )
  for (const m of matched) {
    console.log(
      `  MATCH  ${m.sourceName} → ${m.athlete}  |  ${m.event} (${m.course})  ${m.time}`
    )
  }
  for (const u of unmatched) {
    console.log(
      `  SKIP   ${u.name}  |  ${u.event}  ${u.time}  (no roster match)`
    )
  }
  console.log(
    `--- Imported ${result.count} new swims (${swims.length - result.count} duplicates skipped) ---\n`
  )

  return {
    imported: result.count + leadoffsImported,
    parsed: resultsForConfirm.length,
    matched: swims.length,
    unmatched: unmatched.slice(0, 25),
    unmatchedCount: unmatched.length,
    skippedInvalid,
    relayResultsMatched: relayEntries.length,
    leadoffsImported,
    statusesMatched: statusEntries.length,
    nameConfirmations,
    rosterForPairing,
  }
}

export function resolveMeetDate(
  meetDateRaw: string | null | undefined,
  fallback?: string | null
): Date | null {
  const primary = meetDateRaw?.trim()
  if (primary) {
    const parsed = parseMeetDate(primary)
    if (parsed) return parsed
  }

  const secondary = fallback?.trim()
  if (secondary) {
    return parseMeetDate(secondary)
  }

  return null
}
