/**
 * A meet's resultTeams — each swimmer's team from its results PDF, by athlete id — or an empty map
 * for none. Only kept when the results name several of our teams (an intrasquad's Gold and White).
 */
export function coerceResultTeams(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [athleteId, team] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof team === "string" && team.trim()) out[athleteId] = team.trim()
  }
  return out
}

/**
 * Each swimmer's team as the team code it matches, so the results' spellings ("Gold" on a swim,
 * "GTSC GOLD" on a relay) read as one team: the code whose words all appear in the printed team,
 * ignoring case ("White, Gold" → "Gold"). A team no code matches keeps its printed name.
 */
export function canonicalResultTeams(
  athleteTeams: Record<string, string>,
  teamCodes: string | null
): Record<string, string> {
  const codes = (teamCodes ?? "").split(",").map((c) => c.trim()).filter(Boolean)
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean)
  const out: Record<string, string> = {}
  for (const [athleteId, team] of Object.entries(athleteTeams)) {
    const printed = new Set(words(team))
    const code = codes.find((c) => words(c).every((w) => printed.has(w)))
    out[athleteId] = code ?? team
  }
  return out
}
