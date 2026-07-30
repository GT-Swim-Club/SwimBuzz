import { prisma } from "@/lib/prisma"
import {
  resolvePsychSheetSummary,
  resolveHeatSheetSummary,
  resolveEntriesSheetSummary,
} from "@/lib/meet-sheet-parse"
import { isSheetSummary } from "@/lib/meet-sheet-summary"
import { isEditableSignupSheetSeed } from "@/lib/meet-signup"
import { Prisma } from "@prisma/client"

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

export async function attachSheetSummaries(
  userId: string,
  existing: {
    season: string
    teamCode?: string | null
    psychSheetUrl: string | null
    heatSheetUrl: string | null
    resultsUrl: string | null
    entriesSheetUrl: string | null
    psychSheetSummary: unknown
    heatSheetSummary: unknown
    entriesSheetSummary: unknown
  },
  data: Record<string, unknown>
) {
  const teamCode = effectiveTeamCode(existing, data)
  const teamChanged =
    "teamCode" in data &&
    teamCode !== effectiveTeamCode(existing, {})

  const needsRoster =
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
    ("entriesSheetUrl" in data &&
      ((data.entriesSheetUrl as string | null) ?? null) !== existing.entriesSheetUrl) ||
    ("entriesSheetUrl" in data &&
      (data.entriesSheetUrl as string | null) &&
      !existing.entriesSheetSummary)

  const roster = needsRoster ? await seasonRoster(existing.season) : null

  // Track whether any sheet PDF is being newly imported so we can purge
  // manual/signup seeds from entriesSheetSummary afterward.
  let sheetImported = false

  if ("psychSheetUrl" in data && roster) {
    const next = (data.psychSheetUrl as string | null) ?? null
    const shouldParse =
      next !== existing.psychSheetUrl ||
    (next && !existing.psychSheetSummary) ||
      (teamChanged && !!next)
    if (shouldParse) {
      try {
        data.psychSheetSummary = await resolvePsychSheetSummary(userId, next, roster, teamCode)
        if (next) sheetImported = true
      } catch (err) {
        console.error("Psych sheet parse failed:", err)
        data.psychSheetSummary = null
      }
    }
  } else if (teamChanged && existing.psychSheetUrl && roster) {
    try {
      data.psychSheetSummary = await resolvePsychSheetSummary(
        userId,
        existing.psychSheetUrl,
        roster,
        teamCode
      )
      sheetImported = true
    } catch (err) {
      console.error("Psych sheet parse failed:", err)
      data.psychSheetSummary = null
    }
  }

  if ("heatSheetUrl" in data && roster) {
    const next = (data.heatSheetUrl as string | null) ?? null
    const shouldParse =
      next !== existing.heatSheetUrl ||
      (next && !existing.heatSheetSummary) ||
      (teamChanged && !!next)
    if (shouldParse) {
      try {
        data.heatSheetSummary = await resolveHeatSheetSummary(userId, next, roster, teamCode)
        if (next) sheetImported = true
      } catch (err) {
        console.error("Heat sheet parse failed:", err)
        data.heatSheetSummary = null
      }
    }
  } else if (teamChanged && existing.heatSheetUrl && roster) {
    try {
      data.heatSheetSummary = await resolveHeatSheetSummary(
        userId,
        existing.heatSheetUrl,
        roster,
        teamCode
      )
      sheetImported = true
    } catch (err) {
      console.error("Heat sheet parse failed:", err)
      data.heatSheetSummary = null
    }
  }

  if ("entriesSheetUrl" in data && roster) {
    const next = (data.entriesSheetUrl as string | null) ?? null
    const shouldParse =
      next !== existing.entriesSheetUrl ||
      (next && !existing.entriesSheetSummary) ||
      (teamChanged && !!next)
    if (shouldParse) {
      try {
        data.entriesSheetSummary = await resolveEntriesSheetSummary(userId, next, roster, teamCode)
        if (next) sheetImported = true
      } catch (err) {
        console.error("Entries sheet parse failed:", err)
        data.entriesSheetSummary = null
      }
    }
  } else if (teamChanged && existing.entriesSheetUrl && roster) {
    try {
      data.entriesSheetSummary = await resolveEntriesSheetSummary(
        userId,
        existing.entriesSheetUrl,
        roster,
        teamCode
      )
      sheetImported = true
    } catch (err) {
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
}

export async function attachSheetSummariesOnCreate(
  userId: string,
  season: string,
  data: Record<string, unknown>
) {
  const roster = await seasonRoster(season)
  const teamCode = effectiveTeamCode({}, data)

  let sheetImported = false

  if (data.psychSheetUrl) {
    try {
      data.psychSheetSummary = await resolvePsychSheetSummary(
        userId,
        data.psychSheetUrl as string,
        roster,
        teamCode
      )
      sheetImported = true
    } catch (err) {
      console.error("Psych sheet parse failed:", err)
      data.psychSheetSummary = null
    }
  }

  if (data.heatSheetUrl) {
    try {
      data.heatSheetSummary = await resolveHeatSheetSummary(
        userId,
        data.heatSheetUrl as string,
        roster,
        teamCode
      )
      sheetImported = true
    } catch (err) {
      console.error("Heat sheet parse failed:", err)
      data.heatSheetSummary = null
    }
  }

  if (data.entriesSheetUrl) {
    try {
      data.entriesSheetSummary = await resolveEntriesSheetSummary(
        userId,
        data.entriesSheetUrl as string,
        roster,
        teamCode
      )
      sheetImported = true
    } catch (err) {
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
}
