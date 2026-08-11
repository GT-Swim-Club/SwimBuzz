import { prisma } from "@/lib/prisma"
import type { MeetInfoDropKind } from "@/lib/meet-roster-notify"
import {
  resolvePsychSheetSummary,
  resolveHeatSheetSummary,
  resolveEntriesSheetSummary,
  resolveFinalsHeatSheetSummaries,
  applyPairedSheetEntries,
  applyPairedFinalsHeatSheetEntries,
  collectSheetNameConfirmations,
  type CachedSheetParses,
  type SheetMatchOptions,
} from "@/lib/meet-sheet-parse"
import { isSheetSummary } from "@/lib/meet-sheet-summary"
import { isEditableSignupSheetSeed } from "@/lib/meet-signup"
import type { NameConfirmation, RosterPairingOption } from "@/lib/meet-import"
import { MeetImportValidationError } from "@/lib/meet-import-validate"
import { Prisma } from "@prisma/client"
import {
  finalsHeatSheetUrlList,
  normalizeFinalsHeatSheetUrls,
  type FinalsHeatSheetLink,
} from "@/lib/meet-files"

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
  existingSummary: unknown,
  teamChanged: boolean
): boolean {
  return (
    next !== existingUrl ||
    Boolean(next && !existingSummary) ||
    (teamChanged && Boolean(next))
  )
}

function sheetSummaryFrom(
  data: Record<string, unknown>,
  existing: unknown,
  key: "psychSheetSummary" | "heatSheetSummary" | "entriesSheetSummary" | "finalsHeatSheetSummary"
): unknown {
  if (key in data) return data[key]
  return existing
}

function finalsUrlsEqual(a: unknown, b: unknown): boolean {
  const left = finalsHeatSheetUrlList(a)
  const right = finalsHeatSheetUrlList(b)
  if (left.length !== right.length) return false
  return left.every((url, i) => url === right[i])
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

export async function attachSheetSummaries(
  userId: string,
  existing: {
    name?: string | null
    season: string
    teamCode?: string | null
    psychSheetUrl: string | null
    heatSheetUrl: string | null
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

  const existingFinalsLinks =
    normalizeFinalsHeatSheetUrls(existing.finalsHeatSheetUrls) ?? []
  const nextFinalsLinks = effectiveFinalsLinks(existing, data)
  const finalsChanged =
    ("finalsHeatSheetUrls" in data &&
      !finalsUrlsEqual(data.finalsHeatSheetUrls, existing.finalsHeatSheetUrls)) ||
    ("finalsHeatSheetUrls" in data &&
      nextFinalsLinks.length > 0 &&
      !existing.finalsHeatSheetSummary)

  const needsRoster =
    pairOnly ||
    teamChanged ||
    ("psychSheetUrl" in data &&
      ((data.psychSheetUrl as string | null) ?? null) !== existing.psychSheetUrl) ||
    ("psychSheetUrl" in data &&
      (data.psychSheetUrl as string | null) &&
      !existing.psychSheetSummary) ||
    ("heatSheetUrl" in data &&
      ((data.heatSheetUrl as string | null) ?? null) !== existing.heatSheetUrl) ||
    ("heatSheetUrl" in data &&
      (data.heatSheetUrl as string | null) &&
      !existing.heatSheetSummary) ||
    finalsChanged ||
    (teamChanged && existingFinalsLinks.length > 0) ||
    ("entriesSheetUrl" in data &&
      ((data.entriesSheetUrl as string | null) ?? null) !== existing.entriesSheetUrl) ||
    ("entriesSheetUrl" in data &&
      (data.entriesSheetUrl as string | null) &&
      !existing.entriesSheetSummary)

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

    const heatUrl =
      ("heatSheetUrl" in data
        ? (data.heatSheetUrl as string | null)
        : existing.heatSheetUrl) ?? null
    if (heatUrl) {
      try {
        const { summary, sheetNames } = await applyPairedSheetEntries(
          userId,
          heatUrl,
          "heat",
          roster,
          teamCode,
          sheetSummaryFrom(data, existing.heatSheetSummary, "heatSheetSummary"),
          nameMappings,
          matchOptions.cachedSheetParses?.heat,
          options
        )
        data.heatSheetSummary = summary
        allSheetNames.push(...sheetNames)
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
  } else if ("psychSheetUrl" in data && roster) {
    const next = (data.psychSheetUrl as string | null) ?? null
    const shouldParse = shouldParseSheet(
      next,
      existing.psychSheetUrl,
      existing.psychSheetSummary,
      teamChanged
    )
    if (shouldParse) {
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
        if (next) {
          sheetImported = true
          sheetDrops.push("psych_sheet")
        }
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

  if (!pairOnly && "heatSheetUrl" in data && roster) {
    const next = (data.heatSheetUrl as string | null) ?? null
    const shouldParse = shouldParseSheet(
      next,
      existing.heatSheetUrl,
      existing.heatSheetSummary,
      teamChanged
    )
    if (shouldParse) {
      try {
        const { summary, sheetNames, cachedParse } = await resolveHeatSheetSummary(
          userId,
          next,
          roster,
          teamCode,
          options
        )
        data.heatSheetSummary = summary
        allSheetNames.push(...sheetNames)
        if (cachedParse) cachedSheetParses.heat = cachedParse
        if (next) {
          sheetImported = true
          sheetDrops.push("heat_sheet")
        }
      } catch (err) {
        rethrowImportValidation(err)
        console.error("Heat sheet parse failed:", err)
        data.heatSheetSummary = null
      }
    }
  } else if (!pairOnly && teamChanged && existing.heatSheetUrl && roster) {
    try {
      const { summary, sheetNames, cachedParse } = await resolveHeatSheetSummary(
        userId,
        existing.heatSheetUrl,
        roster,
        teamCode,
        options
      )
      data.heatSheetSummary = summary
      allSheetNames.push(...sheetNames)
      if (cachedParse) cachedSheetParses.heat = cachedParse
      sheetImported = true
      sheetDrops.push("heat_sheet")
    } catch (err) {
      rethrowImportValidation(err)
      console.error("Heat sheet parse failed:", err)
      data.heatSheetSummary = null
    }
  }

  if (!pairOnly && roster && (finalsChanged || (teamChanged && existingFinalsLinks.length > 0))) {
    const urls = nextFinalsLinks.map((l) => l.url)
    if (urls.length === 0) {
      data.finalsHeatSheetSummary = null
    } else {
      try {
        const { summary, sheetNames, cachedParses } =
          await resolveFinalsHeatSheetSummaries(
            userId,
            urls,
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
  }

  if (!pairOnly && "entriesSheetUrl" in data && roster) {
    const next = (data.entriesSheetUrl as string | null) ?? null
    const shouldParse = shouldParseSheet(
      next,
      existing.entriesSheetUrl,
      existing.entriesSheetSummary,
      teamChanged
    )
    if (shouldParse) {
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
        if (next) {
          sheetImported = true
          sheetDrops.push("entries_sheet")
        }
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

  if (data.heatSheetUrl) {
    try {
      const { summary, sheetNames } = await resolveHeatSheetSummary(
        userId,
        data.heatSheetUrl as string,
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
