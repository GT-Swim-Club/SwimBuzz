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

/**
 * Clean user-supplied alternate names into a deduped list. Accepts either an
 * array of strings or a single comma-separated string.
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
  }
  return result
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

export function matchAthleteId(
  pdfName: string,
  roster: RosterAthlete[]
): string | null {
  const lookup = buildAthleteLookup(roster)
  return matchAthleteIdFast(pdfName, lookup)
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
  lookup: AthleteLookup
): string | null {
  const parsed = parsePdfName(pdfName)
  if (!parsed) return null

  const exact =
    lookup.exact.get(normalize(`${parsed.first} ${parsed.last}`)) ??
    lookup.exact.get(normalize(`${parsed.last} ${parsed.first}`))
  if (exact) return exact

  return matchFuzzy(parsed, lookup.roster)
}
