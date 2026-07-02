export type RosterAthlete = {
  id: string
  firstName: string
  lastName: string
}

export type AthleteLookup = {
  exact: Map<string, string>
  roster: RosterAthlete[]
}

/** Common first-name variants (e.g. Bob ↔ Robert) where prefix matching is not enough. */
const FIRST_NAME_ALIAS_GROUPS = [
  ["alexander", "alex", "xander"],
  ["anthony", "tony"],
  ["benjamin", "ben"],
  ["charles", "charlie", "chuck"],
  ["christopher", "chris"],
  ["daniel", "dan", "danny"],
  ["david", "dave"],
  ["elizabeth", "liz", "beth", "betty"],
  ["james", "jim", "jimmy"],
  ["joseph", "joe", "joey"],
  ["katherine", "kate", "katie", "kathy"],
  ["matthew", "matt"],
  ["michael", "mike"],
  ["nicholas", "nick"],
  ["patrick", "pat"],
  ["richard", "rick", "dick"],
  ["robert", "rob", "bob", "bobby"],
  ["samuel", "sam"],
  ["stephen", "steve"],
  ["steven", "steve"],
  ["thomas", "tom", "tommy"],
  ["william", "will", "bill", "billy"],
  ["zachary", "zach", "zack"],
]

const FIRST_NAME_ALIAS_GROUP = new Map<string, string>()
for (const group of FIRST_NAME_ALIAS_GROUPS) {
  const id = group[0]
  for (const name of group) {
    FIRST_NAME_ALIAS_GROUP.set(name, id)
  }
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
  const first = normalize(athlete.firstName)
  const last = normalize(athlete.lastName)
  return [normalize(`${first} ${last}`), normalize(`${last} ${first}`)]
}

function firstNameAliasKey(first: string): string | null {
  const normalized = normalize(first)
  return FIRST_NAME_ALIAS_GROUP.get(normalized) ?? null
}

export function firstNamesCompatible(resultFirst: string, rosterFirst: string): boolean {
  const a = normalize(resultFirst)
  const b = normalize(rosterFirst)
  if (!a || !b) return false
  if (a === b) return true

  const aliasA = firstNameAliasKey(a)
  const aliasB = firstNameAliasKey(b)
  if (aliasA && aliasB && aliasA === aliasB) return true

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

  const matches = candidates.filter((athlete) =>
    firstNamesCompatible(parsed.first, athlete.firstName)
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
