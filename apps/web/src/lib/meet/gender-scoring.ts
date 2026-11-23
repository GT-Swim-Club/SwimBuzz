import { coerceScoringTable, placePoints, type ScoringTable, type TeamScores, type TeamStanding } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { buildAthleteLookup, matchAthleteIdFast } from "@/lib/athlete/athlete-match"
import { normalizeEventName, parseSwimTime } from "@/lib/swim/swim-parse"
import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"

/**
 * Scoring women and men separately (Meet.scoreByGender): an intrasquad's mixed individual events,
 * re-placed and re-scored within each gender. Mixed relays keep the results' own places and points.
 */

type GenderedRow = {
  name: string
  event: string
  time: string
  tags?: string
  place?: number
  points?: number
  team?: string | null
}

/** Points for a place shared by `count` swimmers: the places they span, averaged. */
function sharedPoints(values: number[] | undefined, place: number, count: number): number | undefined {
  const spanned = Array.from({ length: count }, (_, i) => placePoints(values, place + i) ?? 0)
  if (placePoints(values, place) == null) return undefined
  const total = spanned.reduce((sum, p) => sum + p, 0)
  return Math.round((total / count) * 100) / 100
}

/**
 * The rows with each swim's place among its own gender in its event and round (ties share a place),
 * and that place's points from the meet's individual table — never the combined results' points.
 * Statuses (NS, DQ), relay lead-offs and swimmers whose gender isn't known get no place or points.
 */
export function placeResultsByGender<T extends GenderedRow>(
  rows: T[],
  genderOf: (row: T) => "M" | "F" | null,
  table: ScoringTable | null
): T[] {
  const groups = new Map<string, Array<{ index: number; ms: number }>>()
  rows.forEach((row, index) => {
    const gender = genderOf(row)
    const ms = parseSwimTime(row.time)
    if (!gender || !ms || isRelayLeadoffSwimTag(row.tags ?? "")) return
    const key = `${normalizeEventName(row.event)}|${(row.tags ?? "").trim()}|${gender}`
    groups.set(key, [...(groups.get(key) ?? []), { index, ms }])
  })

  const out: T[] = rows.map((row) => {
    const { place: _place, points: _points, ...rest } = row
    return rest as T
  })
  for (const swims of groups.values()) {
    swims.sort((a, b) => a.ms - b.ms)
    let i = 0
    while (i < swims.length) {
      let j = i
      while (j + 1 < swims.length && swims[j + 1]!.ms === swims[i]!.ms) j++
      const place = i + 1
      const points = sharedPoints(table?.individual, place, j - i + 1)
      for (let k = i; k <= j; k++) {
        const index = swims[k]!.index
        out[index] = { ...out[index]!, place, ...(points != null ? { points } : {}) }
      }
      i = j + 1
    }
  }
  return out
}

/** Standings from points per team: most points first, ties sharing a place. */
function standings(points: Map<string, number>, ours: Set<string>): TeamStanding[] {
  const sorted = [...points].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return sorted.map(([team, total], i) => {
    const place = i > 0 && sorted[i - 1]![1] === total ? sorted.findIndex(([, p]) => p === total) + 1 : i + 1
    return { place, team, points: Math.round(total * 100) / 100, ...(ours.has(team) ? { ours: true } : {}) }
  })
}

/**
 * Women's, men's and combined team scores from the re-scored individual swims plus the relays'
 * points (combined only — the relays are mixed). Team names follow the results' own standings
 * ("White" on a swim → "GTSC White"); `oursTeams` are flagged ours.
 */
export function teamScoresByGender(input: {
  rows: Array<GenderedRow & { gender: "M" | "F" | null }>
  relays: Array<{ team?: string | null; points?: number | null }>
  /** Team names as the results' standings print them, for naming. */
  knownTeams: string[]
  oursTeams: string[]
}): TeamScores | null {
  const canonical = (raw: string | null | undefined): string | null => {
    const name = raw?.trim()
    if (!name) return null
    const lower = name.toLowerCase()
    const exact = input.knownTeams.find((t) => t.toLowerCase() === lower)
    if (exact) return exact
    const byWord = input.knownTeams.filter((t) => t.toLowerCase().split(/\s+/).includes(lower))
    if (byWord.length === 1) return byWord[0]!
    // "GTSC WHITE" from a relay line → its standings spelling.
    const words = lower.split(/\s+/)
    const byWords = input.knownTeams.find((t) => t.toLowerCase().split(/\s+/).every((w) => words.includes(w)))
    return byWords ?? name
  }
  const women = new Map<string, number>()
  const men = new Map<string, number>()
  const combined = new Map<string, number>()
  const add = (map: Map<string, number>, team: string, points: number) => map.set(team, (map.get(team) ?? 0) + points)
  for (const row of input.rows) {
    const team = canonical(row.team)
    if (!team || !row.gender || row.points == null || row.points <= 0) continue
    add(row.gender === "F" ? women : men, team, row.points)
    add(combined, team, row.points)
  }
  for (const relay of input.relays) {
    const team = canonical(relay.team)
    if (!team || relay.points == null || relay.points <= 0) continue
    add(combined, team, relay.points)
  }
  if (combined.size === 0) return null
  const ours = new Set(input.oursTeams.map((t) => canonical(t) ?? t))
  return {
    source: "computed",
    women: standings(women, ours),
    men: standings(men, ours),
    combined: standings(combined, ours),
  }
}

/**
 * A results PDF's individual rows placed and scored for women and men separately (Meet.scoreByGender),
 * with the team scores that gives — women's, men's, and combined with the mixed relays' points.
 * Genders come from the season roster, matched the way the import matches names.
 */
export async function rescoreResultsByGender<T extends GenderedRow>(input: {
  results: T[]
  relays: Array<{ team?: string | null; points?: number | null }>
  season: string
  nameMappings: Record<string, string> | null
  scoringTable: unknown
  /** The results' printed team scores, for team names and which teams are ours. */
  printedTeamScores: TeamScores | null
}): Promise<{ results: T[]; teamScores: TeamScores | null }> {
  const roster = await prisma.athlete.findMany({
    where: { seasons: { has: input.season } },
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const lookup = buildAthleteLookup(roster)
  const genders = new Map(roster.map((a) => [a.id, a.gender]))
  const genderOf = (row: T): "M" | "F" | null => {
    const id = matchAthleteIdFast(row.name, lookup, input.nameMappings)
    const gender = id ? genders.get(id) : undefined
    return gender === "M" || gender === "F" ? gender : null
  }
  const results = placeResultsByGender(input.results, genderOf, coerceScoringTable(input.scoringTable))
  const printed = input.printedTeamScores
  const printedTeams = printed ? [...printed.combined, ...printed.women, ...printed.men] : []
  const teamScores = teamScoresByGender({
    rows: results.map((row) => ({ ...row, gender: genderOf(row) })),
    relays: input.relays,
    knownTeams: [...new Set(printedTeams.map((t) => t.team))],
    oursTeams: [...new Set(printedTeams.filter((t) => t.ours).map((t) => t.team))],
  })
  return { results, teamScores }
}
