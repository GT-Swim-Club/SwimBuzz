export type RosterAthlete = {
  id: string
  firstName: string
  lastName: string
  nicknames?: string[]
}

export type AthleteLookup = {
  exact: Map<string, string>
  roster: RosterAthlete[]
}

export const MAX_NICKNAMES = 2

/**
 * Clean user-supplied alternate names into a deduped list. Accepts either an
 * array of strings or a single comma-separated string, up to the allowed limit.
 */
export function normalizeNicknames(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : []

  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    const trimmed = String(item ?? "").trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
    if (result.length === MAX_NICKNAMES) break
  }
  return result
}

/** Extract a parenthetical nickname from a single first-name cell. */
export function parseFirstNameWithNicknames(value: string): {
  firstName: string
  nicknames: string[]
} {
  const trimmed = value.trim()
  if (!trimmed) return { firstName: "", nicknames: [] }

  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (parenMatch) {
    return {
      firstName: parenMatch[1].trim(),
      nicknames: normalizeNicknames(parenMatch[2]),
    }
  }

  return { firstName: trimmed, nicknames: [] }
}

/** Parse a full or partial name, extracting parenthetical nicknames when present. */
export function parseRosterName(fullName: string): {
  firstName: string
  lastName: string
  nicknames: string[]
} {
  const trimmed = fullName.trim()
  if (!trimmed) return { firstName: "", lastName: "", nicknames: [] }

  if (trimmed.includes(",")) {
    const [lastPart, ...rest] = trimmed.split(",")
    const lastName = lastPart.trim()
    const firstPart = rest.join(",").trim()
    if (!lastName || !firstPart) return { firstName: "", lastName: "", nicknames: [] }

    const parsedFirst = parseFirstNameWithNicknames(firstPart)
    if (parsedFirst.firstName) {
      return { firstName: parsedFirst.firstName, lastName, nicknames: parsedFirst.nicknames }
    }
    return { firstName: "", lastName: "", nicknames: [] }
  }

  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s+(.+)$/)
  if (parenMatch) {
    return {
      firstName: parenMatch[1].trim(),
      lastName: parenMatch[3].trim(),
      nicknames: normalizeNicknames(parenMatch[2]),
    }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length < 2) {
    return { firstName: parts[0] ?? "", lastName: "", nicknames: [] }
  }
  return { firstName: parts[0], lastName: parts[parts.length - 1], nicknames: [] }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function parsePdfName(name: string): { first: string; last: string } | null {
  const trimmed = name.trim()
  if (!trimmed) return null

  if (trimmed.includes(",")) {
    const [last, ...rest] = trimmed.split(",")
    const firstPart = rest.join(" ").trim().split(/\s+/)[0]
    if (!firstPart || !last.trim()) return null
    return { first: firstPart, last: last.trim() }
  }

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return null
  return { first: parts[0], last: parts[parts.length - 1] }
}

function rosterKeys(athlete: RosterAthlete): string[] {
  const last = normalize(athlete.lastName)
  const keys: string[] = []

  // The roster first name plus any alternate names / nicknames.
  const firstNames = [athlete.firstName, ...(athlete.nicknames ?? [])]
  for (const raw of firstNames) {
    const value = normalize(raw)
    if (!value) continue

    if (value.includes(" ")) {
      // A full alternate name like "Alex Diachenko" — match it directly and reversed.
      const parts = value.split(" ")
      const altFirst = parts[0]
      const altLast = parts[parts.length - 1]
      keys.push(value, normalize(`${altLast} ${altFirst}`))
    } else {
      // A first-name nickname — pair it with the roster last name.
      keys.push(normalize(`${value} ${last}`), normalize(`${last} ${value}`))
    }
  }

  return keys
}

export function firstNamesCompatible(resultFirst: string, rosterFirst: string): boolean {
  const a = normalize(resultFirst)
  const b = normalize(rosterFirst)
  if (!a || !b) return false
  if (a === b) return true

  const minLen = 3
  if (a.length >= minLen && b.length >= minLen) {
    return a.startsWith(b) || b.startsWith(a)
  }

  return false
}

function matchFuzzy(
  parsed: { first: string; last: string },
  roster: RosterAthlete[]
): string | null {
  const targetLast = normalize(parsed.last)
  const candidates = roster.filter(
    (athlete) => normalize(athlete.lastName) === targetLast
  )
  if (candidates.length === 0) return null

  const matches = candidates.filter(
    (athlete) =>
      firstNamesCompatible(parsed.first, athlete.firstName) ||
      (athlete.nicknames ?? []).some((nick) =>
        // Nicknames may be a bare first name or a full "First Last" string.
        firstNamesCompatible(parsed.first, nick.trim().split(/\s+/)[0] ?? nick)
      )
  )
  if (matches.length === 1) return matches[0].id
  return null
}

/** Levenshtein edit distance for short personal-name comparisons. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function isCloseToken(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const d = editDistance(a, b)
  const maxLen = Math.max(a.length, b.length)
  if (maxLen <= 3) return false
  if (maxLen <= 5) return d <= 1
  return d <= 2
}

function rosterFirstTokens(athlete: RosterAthlete): string[] {
  const tokens: string[] = []
  for (const raw of [athlete.firstName, ...(athlete.nicknames ?? [])]) {
    const value = normalize(raw)
    if (!value) continue
    tokens.push(value.includes(" ") ? value.split(" ")[0]! : value)
  }
  return tokens
}

export type NearMatchAthlete = {
  athleteId: string
  firstName: string
  lastName: string
  /** Lower is closer; > 0 means not an exact auto-match. */
  score: number
}

/**
 * Suggest a single roster athlete when the PDF name looks like a typo of theirs.
 * Returns null when an exact/fuzzy match already exists, or when no unique near match.
 */
export function findNearMatchAthlete(
  pdfName: string,
  roster: RosterAthlete[]
): NearMatchAthlete | null {
  const lookup = buildAthleteLookup(roster)
  if (matchAthleteIdFast(pdfName, lookup)) return null

  const parsed = parsePdfName(pdfName)
  if (!parsed) return null
  const pdfFirst = normalize(parsed.first)
  const pdfLast = normalize(parsed.last)
  if (!pdfFirst || !pdfLast) return null

  const scored: NearMatchAthlete[] = []
  for (const athlete of roster) {
    const rosterLast = normalize(athlete.lastName)
    if (!rosterLast) continue
    if (!isCloseToken(pdfLast, rosterLast) && pdfLast !== rosterLast) continue

    const firstTokens = rosterFirstTokens(athlete)
    let bestFirst = Number.POSITIVE_INFINITY
    for (const token of firstTokens) {
      if (firstNamesCompatible(pdfFirst, token) || isCloseToken(pdfFirst, token)) {
        bestFirst = Math.min(bestFirst, editDistance(pdfFirst, token))
      }
    }
    if (!Number.isFinite(bestFirst)) continue

    const lastDist = editDistance(pdfLast, rosterLast)
    const score = lastDist * 3 + bestFirst
    // Exact strings should have been caught by matchAthleteIdFast.
    if (score === 0) continue
    scored.push({
      athleteId: athlete.id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      score,
    })
  }

  if (scored.length === 0) return null
  scored.sort((a, b) => a.score - b.score || a.lastName.localeCompare(b.lastName))
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null
  return scored[0]!
}

/** Normalized `first last` key used for name mapping / rejection. */
export function nameMatchKey(pdfName: string): string | null {
  const parsed = parsePdfName(pdfName)
  if (!parsed) return null
  return normalize(`${parsed.first} ${parsed.last}`)
}

/** Resolve a coach-confirmed PDF name → roster athlete id. */
export function resolveMappedAthleteId(
  pdfName: string,
  nameMappings?: Record<string, string> | null
): string | null {
  if (!nameMappings) return null
  const key = nameMatchKey(pdfName)
  if (!key) return null
  if (nameMappings[key]) return nameMappings[key] ?? null
  for (const [raw, athleteId] of Object.entries(nameMappings)) {
    if (!athleteId) continue
    if (nameMatchKey(raw) === key || normalize(raw) === key) return athleteId
  }
  return null
}

export function isRejectedPdfName(
  pdfName: string,
  rejectedNames?: string[] | null
): boolean {
  if (!rejectedNames?.length) return false
  const key = nameMatchKey(pdfName)
  if (!key) return false
  return rejectedNames.some((raw) => nameMatchKey(raw) === key || normalize(raw) === key)
}

/** Normalize coach-confirmed mappings to `first last` keys. */
export function normalizeNameMappings(
  raw: unknown
): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [pdfName, athleteId] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof athleteId !== "string" || !athleteId.trim()) continue
    const key = nameMatchKey(pdfName) ?? normalize(pdfName)
    if (!key) continue
    out[key] = athleteId.trim()
  }
  return Object.keys(out).length > 0 ? out : null
}

export function normalizeRejectedNames(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const key = nameMatchKey(item) ?? normalize(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item.trim() || key)
  }
  return out.length > 0 ? out : null
}

export function matchAthleteId(
  pdfName: string,
  roster: RosterAthlete[],
  nameMappings?: Record<string, string> | null
): string | null {
  const lookup = buildAthleteLookup(roster)
  return matchAthleteIdFast(pdfName, lookup, nameMappings)
}

export function buildAthleteLookup(roster: RosterAthlete[]): AthleteLookup {
  const exact = new Map<string, string>()
  for (const athlete of roster) {
    for (const key of rosterKeys(athlete)) {
      if (!exact.has(key)) exact.set(key, athlete.id)
    }
  }
  return { exact, roster }
}

export function matchAthleteIdFast(
  pdfName: string,
  lookup: AthleteLookup,
  nameMappings?: Record<string, string> | null
): string | null {
  const mapped = resolveMappedAthleteId(pdfName, nameMappings)
  if (mapped) return mapped

  const parsed = parsePdfName(pdfName)
  if (!parsed) return null

  const exact =
    lookup.exact.get(normalize(`${parsed.first} ${parsed.last}`)) ??
    lookup.exact.get(normalize(`${parsed.last} ${parsed.first}`))
  if (exact) return exact

  return matchFuzzy(parsed, lookup.roster)
}

export function isAutomaticallyMatched(
  pdfName: string,
  lookup: AthleteLookup
): boolean {
  return matchAthleteIdFast(pdfName, lookup, null) !== null
}

