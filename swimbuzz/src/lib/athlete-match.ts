export type RosterAthlete = {
  id: string
  firstName: string
  lastName: string
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

export function matchAthleteId(
  pdfName: string,
  roster: RosterAthlete[]
): string | null {
  const parsed = parsePdfName(pdfName)
  if (!parsed) return null

  const target = normalize(`${parsed.first} ${parsed.last}`)
  const targetReversed = normalize(`${parsed.last} ${parsed.first}`)

  for (const athlete of roster) {
    const keys = rosterKeys(athlete)
    if (keys.includes(target) || keys.includes(targetReversed)) {
      return athlete.id
    }
  }

  return null
}

export function buildAthleteLookup(roster: RosterAthlete[]) {
  const lookup = new Map<string, string>()
  for (const athlete of roster) {
    for (const key of rosterKeys(athlete)) {
      if (!lookup.has(key)) lookup.set(key, athlete.id)
    }
  }
  return lookup
}

export function matchAthleteIdFast(
  pdfName: string,
  lookup: Map<string, string>
): string | null {
  const parsed = parsePdfName(pdfName)
  if (!parsed) return null
  return (
    lookup.get(normalize(`${parsed.first} ${parsed.last}`)) ??
    lookup.get(normalize(`${parsed.last} ${parsed.first}`)) ??
    null
  )
}
