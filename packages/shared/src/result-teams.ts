import { ourTeamSides } from "./team-scores"

/**
 * Each swimmer's team at a meet whose results name several of ours (an intrasquad's "GTSC Gold" /
 * "GTSC White"), by athlete id, as the short side name the summary's pills show ("Gold") — or an
 * empty map when there's one team or none.
 */
export function athleteTeamSides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const teams: Record<string, string> = {}
  for (const [athleteId, team] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof team === "string" && team.trim()) teams[athleteId] = team.trim()
  }
  const names = [...new Set(Object.values(teams))]
  if (names.length < 2) return {}
  const sides = ourTeamSides(names)
  return Object.fromEntries(Object.entries(teams).map(([id, team]) => [id, sides.get(team) ?? team]))
}

/** The team most of these swimmers are on (a relay's), or undefined when none of them has one. */
export function teamOfAthletes(
  athleteIds: readonly (string | null | undefined)[],
  teams: Readonly<Record<string, string>>
): string | undefined {
  const counts = new Map<string, number>()
  for (const id of athleteIds) {
    const team = id ? teams[id] : undefined
    if (team) counts.set(team, (counts.get(team) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** A team pill's color: each has a fill, text and border token (`--brand-color-team-<tone>-*`). */
export type TeamPillTone = "gold" | "white" | "black" | "blue" | "green" | "red" | "purple" | "orange"

export const TEAM_PILL_TONES: readonly TeamPillTone[] = ["gold", "white", "black", "blue", "green", "red", "purple", "orange"]

/** Words in a team's name that pick its color ("Gold", "Navy", "Crimson"). */
const TONE_WORDS = new Map<string, TeamPillTone>([
  ["gold", "gold"],
  ["golden", "gold"],
  ["yellow", "gold"],
  ["white", "white"],
  ["silver", "white"],
  ["grey", "white"],
  ["gray", "white"],
  ["black", "black"],
  ["blue", "blue"],
  ["navy", "blue"],
  ["royal", "blue"],
  ["green", "green"],
  ["red", "red"],
  ["crimson", "red"],
  ["maroon", "red"],
  ["scarlet", "red"],
  ["cardinal", "red"],
  ["purple", "purple"],
  ["violet", "purple"],
  ["orange", "orange"],
])

/** Colors handed out, in order, to teams whose names name no color (or one already taken). */
const FALLBACK_TONES: readonly TeamPillTone[] = ["gold", "blue", "green", "purple", "red", "orange", "black", "white"]

/**
 * Each team's pill color: a team named after a color gets it ("Gold" is gold, "White" white,
 * "Navy" blue); the rest take the next unused color in FALLBACK_TONES, in name order.
 */
export function teamPillTones(teams: Iterable<string>): Record<string, TeamPillTone> {
  const names = [...new Set(teams)].sort((a, b) => a.localeCompare(b))
  const tones: Record<string, TeamPillTone> = {}
  const used = new Set<TeamPillTone>()
  for (const name of names) {
    const tone = name
      .toLowerCase()
      .split(/[^a-z]+/)
      .map((word) => TONE_WORDS.get(word))
      .find((t): t is TeamPillTone => t != null && !used.has(t))
    if (tone) {
      tones[name] = tone
      used.add(tone)
    }
  }
  for (const name of names) {
    if (tones[name]) continue
    const tone = FALLBACK_TONES.find((t) => !used.has(t)) ?? FALLBACK_TONES[0]!
    tones[name] = tone
    used.add(tone)
  }
  return tones
}

/** A tone from an export request, or undefined when it isn't one. */
export function coerceTeamPillTone(value: unknown): TeamPillTone | undefined {
  return typeof value === "string" && (TEAM_PILL_TONES as readonly string[]).includes(value)
    ? (value as TeamPillTone)
    : undefined
}

/**
 * A relay's letter split from the team side it names, when that side is one of `teams` — "White A"
 * → { letter: "A", team: "White" } — so the summary names it "Relay A" beside a WHITE pill. Matches
 * when every word of the team is in the side ("GTSC Gold A" is Gold's). Null for a plain letter or a
 * side that isn't one of ours.
 */
export function relayLetterTeam(
  relayLetter: string | null | undefined,
  teams: Iterable<string>
): { letter: string; team: string } | null {
  const sided = (relayLetter ?? "").trim().match(/^(.*\S)\s+([A-Za-z])$/)
  if (!sided) return null
  const words = new Set(sided[1]!.toLowerCase().split(/\s+/))
  for (const team of new Set(teams)) {
    const teamWords = team.toLowerCase().split(/\s+/).filter(Boolean)
    if (teamWords.length > 0 && teamWords.every((w) => words.has(w))) {
      return { letter: sided[2]!.toUpperCase(), team }
    }
  }
  return null
}

/** A relay letter split into its team side and letter: "White A" → { side: "White", letter: "A" }. */
function splitRelayLetter(relayLetter: string | null | undefined): { side?: string; letter: string } {
  const raw = (relayLetter ?? "").trim()
  const sided = raw.match(/^(.*\S)\s+([A-Za-z])$/)
  return sided ? { side: sided[1], letter: sided[2]!.toUpperCase() } : { letter: raw }
}

/**
 * A relay's name with its team side before "Relay": ("200 Free Relay", "White A") → "200 Free White
 * Relay A", ("", "White A") → "White Relay A", ("200 Free Relay", "A") → "200 Free Relay A".
 * `compact` leaves "Relay" out: "200 Free White A".
 */
export function relayDisplayName(event: string, relayLetter: string | null | undefined, compact = false): string {
  const { side, letter } = splitRelayLetter(relayLetter)
  const base = event.replace(/\s*\bRelay$/i, "").trim()
  return [base, side, compact ? null : "Relay", letter].filter(Boolean).join(" ")
}
