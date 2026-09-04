import { prisma } from "@/lib/prisma"
import type { MeetInfoDropKind } from "@/lib/meet/meet-roster-notify"
import {
  resolvePsychSheetSummary,
  resolveEntriesSheetSummary,
  resolveHeatSheetSummaries,
  resolveFinalsHeatSheetSummaries,
  applyPairedSheetEntries,
  applyPairedHeatSheetEntries,
  applyPairedFinalsHeatSheetEntries,
  collectSheetNameConfirmations,
  type CachedSheetParses,
  type SheetMatchOptions,
} from "@/lib/meet/meet-sheet-parse"
import { isSheetSummary } from "@/lib/meet/meet-sheet-summary"
import { isEditableSignupSheetSeed } from "@/lib/meet/meet-signup"
import type { NameConfirmation, RosterPairingOption } from "@/lib/meet/meet-import"
import { MeetImportValidationError } from "@/lib/meet/meet-import-validate"
import { Prisma } from "@prisma/client"
import {
  normalizeFinalsHeatSheetUrls,
  normalizeHeatSheetUrls,
  type FinalsHeatSheetLink,
  type HeatSheetLink,
} from "@/lib/meet/meet-files"

function rethrowImportValidation(err: unknown): never | void {
  if (err instanceof MeetImportValidationError) throw err
}

function sheetMatchOptions(
  matchOptions: SheetMatchOptions,
  expectedMeetName: string | null | undefined
): SheetMatchOptions {
  return {
    ...matchOptions,
    expectedMeetName: matchOptions.expectedMeetName ?? expectedMeetName ?? null,
  }
}

export type SheetSummaryAttachResult = {
  nameConfirmations: NameConfirmation[]
  rosterForPairing: RosterPairingOption[]
  cachedSheetParses?: CachedSheetParses
  sheetDrops: MeetInfoDropKind[]
}

async function seasonRoster(season: string) {
  return prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: { id: true, firstName: true, lastName: true, nicknames: true },
  })
}

/**
 * Remove manually-added and signup-synced individual entries from
 * entriesSheetSummary, keeping only imported (PDF) rows and relay entries.
 * Called whenever a psych sheet, heat sheet, or entries sheet PDF is imported
 * so that manual/signup seeds don't persist alongside the authoritative sheet data.
 */
function stripManualEntriesFromSummary(
  entriesSheetSummary: unknown
): Prisma.InputJsonValue | null {
  if (!isSheetSummary(entriesSheetSummary)) return null
  const filtered = entriesSheetSummary.entries.filter(
    (e) => !isEditableSignupSheetSeed(e)
  )
  return JSON.parse(
    JSON.stringify({ ...entriesSheetSummary, entries: filtered })
  ) as Prisma.InputJsonValue
}

function effectiveTeamCode(
  existing: { teamCode?: string | null },
  data: Record<string, unknown>
): string {
  if ("teamCode" in data) {
    const code = String(data.teamCode ?? "").trim()
    return code || "GTSC"
  }
  return existing.teamCode?.trim() || "GTSC"
}

function shouldParseSheet(
  next: string | null,
  existingUrl: string | null,
  teamChanged: boolean
): boolean {
  if (!next) return false
  return next !== existingUrl || teamChanged
}

function sheetSummaryFrom(
  data: Record<string, unknown>,
  existing: unknown,
  key: "psychSheetSummary" | "heatSheetSummary" | "entriesSheetSummary" | "finalsHeatSheetSummary"
): unknown {
  if (key in data) return data[key]
  return existing
}

function effectiveHeatLinks(
  existing: { heatSheetUrl?: string | null; heatSheetUrls?: unknown },
  data: Record<string, unknown>
): HeatSheetLink[] {
  if ("heatSheetUrls" in data) {
    return normalizeHeatSheetUrls(data.heatSheetUrls) ?? []
  }
  if ("heatSheetUrl" in data) {
    const url = String(data.heatSheetUrl ?? "").trim()
    return url ? [{ url }] : []
  }
  const stored = normalizeHeatSheetUrls(existing.heatSheetUrls)
  return stored ?? (existing.heatSheetUrl ? [{ url: existing.heatSheetUrl }] : [])
}

function effectiveFinalsLinks(
  existing: { finalsHeatSheetUrls?: unknown },
  data: Record<string, unknown>
): FinalsHeatSheetLink[] {
  if ("finalsHeatSheetUrls" in data) {
    return normalizeFinalsHeatSheetUrls(data.finalsHeatSheetUrls) ?? []
  }
  return normalizeFinalsHeatSheetUrls(existing.finalsHeatSheetUrls) ?? []
}

function sheetUrlsChanged(
  existing: Array<{ url: string }>,
  next: Array<{ url: string }>
): boolean {
  if (existing.length !== next.length) return true
  return existing.some((link, index) => link.url !== next[index]?.url)
}

export async function attachSheetSummaries(
  userId: string,
  existing: {
    name?: string | null
    season: string
    teamCode?: string | null
    psychSheetUrl: string | null
    heatSheetUrl: string | null
    heatSheetUrls?: unknown
    finalsHeatSheetUrls?: unknown
    resultsUrl: string | null
    entriesSheetUrl: string | null
    psychSheetSummary: unknown
    heatSheetSummary: unknown
    finalsHeatSheetSummary?: unknown
    entriesSheetSummary: unknown
  },
  data: Record<string, unknown>,
  matchOptions: SheetMatchOptions = {}
): Promise<SheetSummaryAttachResult> {
  const teamCode = effectiveTeamCode(existing, data)
  const teamChanged =
    "teamCode" in data &&
    teamCode !== effectiveTeamCode(existing, {})
  const expectedMeetName =
    (typeof data.name === "string" ? data.name : null) || existing.name || null
  const options = sheetMatchOptions(matchOptions, expectedMeetName)

  const pairOnly = Boolean(matchOptions.nameMappings)
  const nameMappings = matchOptions.nameMappings ?? {}

  const existingHeatLinks = effectiveHeatLinks(existing, {})
  const nextHeatLinks = effectiveHeatLinks(existing, data)
  const nextHeatUrls = nextHeatLinks.map((l) => l.url)
  const shouldParseHeat =
    sheetUrlsChanged(existingHeatLinks, nextHeatLinks) ||
    (teamChanged && nextHeatUrls.length > 0)

  const existingFinalsLinks =
    normalizeFinalsHeatSheetUrls(existing.finalsHeatSheetUrls) ?? []
  const nextFinalsLinks = effectiveFinalsLinks(existing, data)
  const nextFinalsUrls = nextFinalsLinks.map((l) => l.url)
  const shouldParseFinals =
    sheetUrlsChanged(existingFinalsLinks, nextFinalsLinks) ||
    (teamChanged && nextFinalsUrls.length > 0)

  const nextPsychUrl =
    "psychSheetUrl" in data
      ? ((data.psychSheetUrl as string | null) ?? null)
      : existing.psychSheetUrl
  const nextEntriesUrl =
    "entriesSheetUrl" in data
      ? ((data.entriesSheetUrl as string | null) ?? null)
      : existing.entriesSheetUrl

  const needsRoster =
    pairOnly ||
    shouldParseSheet(nextPsychUrl, existing.psychSheetUrl, teamChanged) ||
    shouldParseHeat ||
    shouldParseSheet(nextEntriesUrl, existing.entriesSheetUrl, teamChanged) ||
    shouldParseFinals

  const roster = needsRoster ? await seasonRoster(existing.season) : null
  const allSheetNames: string[] = []
  const cachedSheetParses: CachedSheetParses = {}

  // Track whether any sheet PDF is being newly imported so we can purge
  // manual/signup seeds from entriesSheetSummary afterward.
  let sheetImported = false
  const sheetDrops: MeetInfoDropKind[] = []

  if (pairOnly && roster) {
    const psychUrl =
      ("psychSheetUrl" in data
        ? (data.psychSheetUrl as string | null)
        : existing.psychSheetUrl) ?? null
    if (psychUrl) {
      try {
        const { summary, sheetNames } = await applyPairedSheetEntries(
          userId,
          psychUrl,
          "psych",
          roster,
          teamCode,
          sheetSummaryFrom(data, existing.psychSheetSummary, "psychSheetSummary"),
          nameMappings,
          matchOptions.cachedSheetParses?.psych,
          options
        )
        data.psychSheetSummary = summary
        allSheetNames.push(...sheetNames)
      } catch (err) {
        rethrowImportValidation(err)
        console.error("Psych sheet pair-only parse failed:", err)
      }
    }

    if (nextHeatUrls.length > 0) {
      try {
        const { summary, sheetNames, cachedParses } = await applyPairedHeatSheetEntries(
          userId,
          nextHeatUrls,
          roster,
          teamCode,
          sheetSummaryFrom(data, existing.heatSheetSummary, "heatSheetSummary"),
          nameMappings,
          matchOptions.cachedSheetParses?.heat,
          options
        )
        data.heatSheetSummary = summary
        allSheetNames.push(...sheetNames)
        if (Object.keys(cachedParses).length > 0) {
          cachedSheetParses.heat = cachedParses
        }
      } catch (err) {
        rethrowImportValidation(err)
        console.error("Heat sheet pair-only parse failed:", err)
      }
    }

    const finalsUrls = nextFinalsLinks.map((l) => l.url)
    if (finalsUrls.length > 0) {
      try {
        const { summary, sheetNames, cachedParses } =
          await applyPairedFinalsHeatSheetEntries(
            userId,
            finalsUrls,
            roster,
            teamCode,
            sheetSummaryFrom(
              data,
              existing.finalsHeatSheetSummary,
              "finalsHeatSheetSummary"
            ),
            nameMappings,
            matchOptions.cachedSheetParses?.finals,
            options
          )
        data.finalsHeatSheetSummary = summary
        allSheetNames.push(...sheetNames)
        if (Object.keys(cachedParses).length > 0) {
          cachedSheetParses.finals = {
            ...(cachedSheetParses.finals ?? {}),
            ...cachedParses,
          }
        }
      } catch (err) {
        rethrowImportValidation(err)
        console.error("Finals heat sheet pair-only parse failed:", err)
      }
    }

    const entriesUrl =
      ("entriesSheetUrl" in data
        ? (data.entriesSheetUrl as string | null)
        : existing.entriesSheetUrl) ?? null
    if (entriesUrl) {
      try {
        const { summary, sheetNames } = await applyPairedSheetEntries(
          userId,
          entriesUrl,
          "entries",
          roster,
          teamCode,
          sheetSummaryFrom(data, existing.entriesSheetSummary, "entriesSheetSummary"),
          nameMappings,
          matchOptions.cachedSheetParses?.entries,
          options
        )
        data.entriesSheetSummary = summary
        allSheetNames.push(...sheetNames)
      } catch (err) {
        rethrowImportValidation(err)
        console.error("Entries sheet pair-only parse failed:", err)
      }
    }
  } else if ("psychSheetUrl" in data) {
    const next = (data.psychSheetUrl as string | null) ?? null
    if (!next) {
      if (existing.psychSheetUrl) data.psychSheetSummary = null
    } else if (
      roster &&
      shouldParseSheet(next, existing.psychSheetUrl, teamChanged)
    ) {
      try {
        const { summary, sheetNames, cachedParse } = await resolvePsychSheetSummary(
          userId,
          next,
          roster,
          teamCode,
          options
        )
        data.psychSheetSummary = summary
        allSheetNames.push(...sheetNames)
        if (cachedParse) cachedSheetParses.psych = cachedParse
        sheetImported = true
        sheetDrops.push("psych_sheet")
      } catch (err) {
        rethrowImportValidation(err)
        console.error("Psych sheet parse failed:", err)
        data.psychSheetSummary = null
      }
    }
  } else if (teamChanged && existing.psychSheetUrl && roster) {
    try {
      const { summary, sheetNames, cachedParse } = await resolvePsychSheetSummary(
        userId,
        existing.psychSheetUrl,
        roster,
        teamCode,
        options
      )
      data.psychSheetSummary = summary
      allSheetNames.push(...sheetNames)
      if (cachedParse) cachedSheetParses.psych = cachedParse
      sheetImported = true
      sheetDrops.push("psych_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Psych sheet parse failed:", err)
      data.psychSheetSummary = null
    }
  }

  if (
    !pairOnly &&
    ("heatSheetUrls" in data || "heatSheetUrl" in data) &&
    nextHeatUrls.length === 0
  ) {
    if (existingHeatLinks.length > 0) data.heatSheetSummary = null
  } else if (!pairOnly && roster && shouldParseHeat) {
    try {
      const { summary, sheetNames, cachedParses } = await resolveHeatSheetSummaries(
        userId,
        nextHeatUrls,
        roster,
        teamCode,
        options,
        matchOptions.cachedSheetParses?.heat
      )
      data.heatSheetSummary = summary
      allSheetNames.push(...sheetNames)
      if (Object.keys(cachedParses).length > 0) {
        cachedSheetParses.heat = cachedParses
      }
      sheetImported = true
      sheetDrops.push("heat_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Heat sheet parse failed:", err)
      data.heatSheetSummary = null
    }
  }

  if (!pairOnly && "finalsHeatSheetUrls" in data && nextFinalsUrls.length === 0) {
    if (existingFinalsLinks.length > 0) data.finalsHeatSheetSummary = null
  } else if (!pairOnly && roster && shouldParseFinals) {
    try {
      const { summary, sheetNames, cachedParses } =
        await resolveFinalsHeatSheetSummaries(
          userId,
          nextFinalsUrls,
          roster,
          teamCode,
          options,
          matchOptions.cachedSheetParses?.finals
        )
      data.finalsHeatSheetSummary = summary
      allSheetNames.push(...sheetNames)
      if (Object.keys(cachedParses).length > 0) {
        cachedSheetParses.finals = cachedParses
      }
      sheetImported = true
      sheetDrops.push("finals_heat_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Finals heat sheet parse failed:", err)
      data.finalsHeatSheetSummary = null
    }
  }

  if (!pairOnly && "entriesSheetUrl" in data) {
    const next = (data.entriesSheetUrl as string | null) ?? null
    if (!next) {
      if (existing.entriesSheetUrl) data.entriesSheetSummary = null
    } else if (
      roster &&
      shouldParseSheet(next, existing.entriesSheetUrl, teamChanged)
    ) {
      try {
        const { summary, sheetNames, cachedParse } = await resolveEntriesSheetSummary(
          userId,
          next,
          roster,
          teamCode,
          options
        )
        data.entriesSheetSummary = summary
        allSheetNames.push(...sheetNames)
        if (cachedParse) cachedSheetParses.entries = cachedParse
        sheetImported = true
        sheetDrops.push("entries_sheet")
      } catch (err) {
        rethrowImportValidation(err)
        console.error("Entries sheet parse failed:", err)
        data.entriesSheetSummary = null
      }
    }
  } else if (!pairOnly && teamChanged && existing.entriesSheetUrl && roster) {
    try {
      const { summary, sheetNames, cachedParse } = await resolveEntriesSheetSummary(
        userId,
        existing.entriesSheetUrl,
        roster,
        teamCode,
        options
      )
      data.entriesSheetSummary = summary
      allSheetNames.push(...sheetNames)
      if (cachedParse) cachedSheetParses.entries = cachedParse
      sheetImported = true
      sheetDrops.push("entries_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Entries sheet parse failed:", err)
      data.entriesSheetSummary = null
    }
  }

  // When a psych/heat/entries PDF was imported, purge manual and signup-synced
  // individual entries from entriesSheetSummary so the authoritative sheet data
  // takes precedence. If the entries sheet itself was just resolved above we use
  // that; otherwise we fall back to the existing DB value.
  if (sheetImported) {
    const currentEntries =
      "entriesSheetSummary" in data
        ? data.entriesSheetSummary
        : existing.entriesSheetSummary
    const stripped = stripManualEntriesFromSummary(currentEntries)
    data.entriesSheetSummary = stripped
  }

  if (!roster) {
    return { nameConfirmations: [], rosterForPairing: [], sheetDrops }
  }

  const pairing = collectSheetNameConfirmations(allSheetNames, roster, matchOptions)
  return {
    ...pairing,
    sheetDrops,
    cachedSheetParses:
      pairing.nameConfirmations.length > 0 && Object.keys(cachedSheetParses).length > 0
        ? cachedSheetParses
        : undefined,
  }
}

export async function attachSheetSummariesOnCreate(
  userId: string,
  season: string,
  data: Record<string, unknown>,
  matchOptions: SheetMatchOptions = {}
): Promise<SheetSummaryAttachResult> {
  const roster = await seasonRoster(season)
  const teamCode = effectiveTeamCode({}, data)
  const allSheetNames: string[] = []
  const sheetDrops: MeetInfoDropKind[] = []
  const options = sheetMatchOptions(
    matchOptions,
    typeof data.name === "string" ? data.name : null
  )

  let sheetImported = false

  if (data.psychSheetUrl) {
    try {
      const { summary, sheetNames } = await resolvePsychSheetSummary(
        userId,
        data.psychSheetUrl as string,
        roster,
        teamCode,
        options
      )
      data.psychSheetSummary = summary
      allSheetNames.push(...sheetNames)
      sheetImported = true
      sheetDrops.push("psych_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Psych sheet parse failed:", err)
      data.psychSheetSummary = null
    }
  }

  const createHeatLinks = effectiveHeatLinks({}, data)
  if (createHeatLinks.length > 0) {
    try {
      const { summary, sheetNames } = await resolveHeatSheetSummaries(
        userId,
        createHeatLinks.map((l) => l.url),
        roster,
        teamCode,
        options
      )
      data.heatSheetSummary = summary
      allSheetNames.push(...sheetNames)
      sheetImported = true
      sheetDrops.push("heat_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Heat sheet parse failed:", err)
      data.heatSheetSummary = null
    }
  }

  const createFinalsLinks = normalizeFinalsHeatSheetUrls(data.finalsHeatSheetUrls) ?? []
  if (createFinalsLinks.length > 0) {
    try {
      const { summary, sheetNames } = await resolveFinalsHeatSheetSummaries(
        userId,
        createFinalsLinks.map((l) => l.url),
        roster,
        teamCode,
        options
      )
      data.finalsHeatSheetSummary = summary
      allSheetNames.push(...sheetNames)
      sheetImported = true
      sheetDrops.push("finals_heat_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Finals heat sheet parse failed:", err)
      data.finalsHeatSheetSummary = null
    }
  }

  if (data.entriesSheetUrl) {
    try {
      const { summary, sheetNames } = await resolveEntriesSheetSummary(
        userId,
        data.entriesSheetUrl as string,
        roster,
        teamCode,
        options
      )
      data.entriesSheetSummary = summary
      allSheetNames.push(...sheetNames)
      sheetImported = true
      sheetDrops.push("entries_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Entries sheet parse failed:", err)
      data.entriesSheetSummary = null
    }
  }

  // On create there are no pre-existing manual entries to strip, but if both a
  // sheet URL and an entriesSheetSummary are set in the same payload, keep only
  // imported rows.
  if (sheetImported && "entriesSheetSummary" in data) {
    const stripped = stripManualEntriesFromSummary(data.entriesSheetSummary)
    data.entriesSheetSummary = stripped
  }

  return {
    ...collectSheetNameConfirmations(allSheetNames, roster, matchOptions),
    sheetDrops,
  }
}
