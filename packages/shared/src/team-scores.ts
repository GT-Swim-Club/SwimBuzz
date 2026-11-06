/** One team's line in a meet's standings (from the results PDF). */
export type TeamStanding = {
  place: number
  team: string
  points: number
  /** Our team's line. */
  ours?: boolean
}

export type TeamScoresSection = "women" | "men" | "combined"

/** A meet's team standings: printed by the results PDF, or summed from its Points column. */
export type TeamScores = {
  importedAt?: string
  source: "pdf" | "computed"
  women: TeamStanding[]
  men: TeamStanding[]
  combined: TeamStanding[]
}

export const TEAM_SCORE_SECTIONS: { key: TeamScoresSection; label: string }[] = [
  { key: "women", label: "Women" },
  { key: "men", label: "Men" },
  { key: "combined", label: "Combined" },
]

function coerceStandings(raw: unknown): TeamStanding[] {
  if (!Array.isArray(raw)) return []
  const out: TeamStanding[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    const team = typeof r.team === "string" ? r.team.trim() : ""
    const place = Number(r.place)
    const points = Number(r.points)
    if (!team || !Number.isFinite(place) || place < 1 || !Number.isFinite(points)) continue
    out.push({ place, team, points, ...(r.ours === true ? { ours: true } : {}) })
  }
  return out
}

/** Team scores from stored or parsed JSON, or null when there are none. */
export function coerceTeamScores(raw: unknown): TeamScores | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const scores: TeamScores = {
    source: r.source === "computed" ? "computed" : "pdf",
    women: coerceStandings(r.women),
    men: coerceStandings(r.men),
    combined: coerceStandings(r.combined),
  }
  if (typeof r.importedAt === "string") scores.importedAt = r.importedAt
  if (!scores.women.length && !scores.men.length && !scores.combined.length) return null
  return scores
}

/** "20", "16.5" — points never carry more than a tenth. */
export function formatPoints(points: number): string {
  return String(Math.round(points * 10) / 10)
}

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

/** "1st", or "T-14th" when another team shares the place. */
export function teamPlaceLabel(standing: TeamStanding, standings: TeamStanding[]): string {
  const tied = standings.some((s) => s !== standing && s.place === standing.place)
  return `${tied ? "T-" : ""}${ordinal(standing.place)}`
}

const CLUB_WORDS = new Set([
  "swim",
  "swimming",
  "club",
  "team",
  "university",
  "univ",
  "universtiy",
  "college",
  "at",
  "of",
  "the",
  "aquatics",
])

/**
 * A team's name without the club boilerplate, for tight spots: "Fsu Swim Club" → "FSU",
 * "Swim Club at Georgia State Uni" → "Georgia State Uni", "UNC Chapel Hill" stays.
 */
export function shortTeamName(team: string): string {
  const words = team.trim().split(/\s+/).filter((w) => !CLUB_WORDS.has(w.toLowerCase()))
  if (words.length === 0) return team.trim()
  if (words.length === 1 && words[0].length <= 4) return words[0].toUpperCase()
  return words.join(" ")
}

/**
 * Our margin in a standings list: "+619 on FSU" over the next team when we lead, else
 * "−92.5 to UGA" behind the team one place ahead. Null without our line or a rival.
 */
export function teamScoreGap(standings: TeamStanding[]): string | null {
  const index = standings.findIndex((s) => s.ours)
  if (index < 0) return null
  const ours = standings[index]
  const rival = index === 0 ? standings[1] : standings[index - 1]
  if (!rival) return null
  const margin = formatPoints(Math.abs(ours.points - rival.points))
  if (margin === "0") return `Tied with ${shortTeamName(rival.team)}`
  return index === 0
    ? `+${margin} on ${shortTeamName(rival.team)}`
    : `−${margin} to ${shortTeamName(rival.team)}`
}
