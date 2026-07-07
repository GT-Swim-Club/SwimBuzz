import { prisma } from "@/lib/prisma"
import {
  resolvePsychSheetSummary,
  resolveHeatSheetSummary,
  resolveEntriesSheetSummary,
} from "@/lib/meet-sheet-parse"

async function seasonRoster(season: string) {
  return prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: { id: true, firstName: true, lastName: true, nicknames: true },
  })
}

function effectiveTeamCode(
  existing: { teamCode?: string | null },
  data: Record<string, unknown>
): string {
  if ("teamCode" in data) {
    const next = String(data.teamCode ?? "").trim().toUpperCase()
    return next || "GTSC"
  }
  return (existing.teamCode ?? "GTSC").trim().toUpperCase() || "GTSC"
}

export async function attachSheetSummaries(
  existing: {
    season: string
    teamCode: string | null
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
    teamCode !== ((existing.teamCode ?? "GTSC").trim().toUpperCase() || "GTSC")

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

  if ("psychSheetUrl" in data && roster) {
    const next = (data.psychSheetUrl as string | null) ?? null
    const shouldParse =
      next !== existing.psychSheetUrl ||
      (next && !existing.psychSheetSummary) ||
      (teamChanged && !!next)
    if (shouldParse) {
      try {
        data.psychSheetSummary = await resolvePsychSheetSummary(next, roster, teamCode)
      } catch (err) {
        console.error("Psych sheet parse failed:", err)
        data.psychSheetSummary = null
      }
    }
  } else if (teamChanged && existing.psychSheetUrl && roster) {
    try {
      data.psychSheetSummary = await resolvePsychSheetSummary(
        existing.psychSheetUrl,
        roster,
        teamCode
      )
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
        data.heatSheetSummary = await resolveHeatSheetSummary(next, roster, teamCode)
      } catch (err) {
        console.error("Heat sheet parse failed:", err)
        data.heatSheetSummary = null
      }
    }
  } else if (teamChanged && existing.heatSheetUrl && roster) {
    try {
      data.heatSheetSummary = await resolveHeatSheetSummary(
        existing.heatSheetUrl,
        roster,
        teamCode
      )
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
        data.entriesSheetSummary = await resolveEntriesSheetSummary(next, roster, teamCode)
      } catch (err) {
        console.error("Entries sheet parse failed:", err)
        data.entriesSheetSummary = null
      }
    }
  } else if (teamChanged && existing.entriesSheetUrl && roster) {
    try {
      data.entriesSheetSummary = await resolveEntriesSheetSummary(
        existing.entriesSheetUrl,
        roster,
        teamCode
      )
    } catch (err) {
      console.error("Entries sheet parse failed:", err)
      data.entriesSheetSummary = null
    }
  }
}

export async function attachSheetSummariesOnCreate(
  season: string,
  data: Record<string, unknown>
) {
  const roster = await seasonRoster(season)
  const teamCode = effectiveTeamCode({}, data)

  if (data.psychSheetUrl) {
    try {
      data.psychSheetSummary = await resolvePsychSheetSummary(
        data.psychSheetUrl as string,
        roster,
        teamCode
      )
    } catch (err) {
      console.error("Psych sheet parse failed:", err)
      data.psychSheetSummary = null
    }
  }

  if (data.heatSheetUrl) {
    try {
      data.heatSheetSummary = await resolveHeatSheetSummary(
        data.heatSheetUrl as string,
        roster,
        teamCode
      )
    } catch (err) {
      console.error("Heat sheet parse failed:", err)
      data.heatSheetSummary = null
    }
  }

  if (data.entriesSheetUrl) {
    try {
      data.entriesSheetSummary = await resolveEntriesSheetSummary(
        data.entriesSheetUrl as string,
        roster,
        teamCode
      )
    } catch (err) {
      console.error("Entries sheet parse failed:", err)
      data.entriesSheetSummary = null
    }
  }
}
