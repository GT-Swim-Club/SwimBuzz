import { editDistance } from "@/lib/athlete-match"

export type MeetDocType = "psych" | "heat" | "entries" | "results"

export class MeetImportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MeetImportValidationError"
  }
}

const DOC_TYPE_LABELS: Record<MeetDocType, string> = {
  psych: "psych sheet",
  heat: "heat sheet / meet program",
  entries: "entries report",
  results: "results PDF",
}

const TOKEN_ALIASES: Record<string, string> = {
  invitational: "invite",
  invitationals: "invite",
  invite: "invite",
  championship: "champ",
  championships: "champ",
  champs: "champ",
  nationals: "national",
  national: "national",
}

/** Common meet sponsors / filler that often appear in one source but not the other. */
const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "fall",
  "spring",
  "winter",
  "summer",
  "main",
  "session",
  "timed",
  "finals",
  "prelim",
  "prelims",
  "preliminary",
  "meet",
  "program",
  "psych",
  "sheet",
  "results",
  "scy",
  "scm",
  "lcm",
  "yard",
  "yards",
  "meter",
  "meters",
  "tyr",
  "speedo",
  "arena",
  "nike",
  "phillips",
  "66",
  "omnibots",
  "presented",
  "powered",
  "sponsored",
  "by",
])

/** Known swimming acronyms → expanded tokens (e.g. CCS ↔ College Club Swimming). */
const ACRONYM_EXPANSIONS: Record<string, string[]> = {
  ccs: ["college", "club", "swimming"],
  usms: ["united", "states", "masters", "swimming"],
  ncaa: ["national", "collegiate", "athletic", "association"],
}

function canonicalizeToken(token: string): string {
  return TOKEN_ALIASES[token] ?? token
}

/** Normalize meet titles for soft comparison (years, punctuation, aliases). */
export function normalizeMeetNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/^\d{1,2}-\d{1,2}-\d{2,4}\s+/, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function significantTokens(name: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of normalizeMeetNameForMatch(name).split(" ")) {
    if (!raw || STOP_TOKENS.has(raw)) continue
    const token = canonicalizeToken(raw)
    if (!token || STOP_TOKENS.has(token) || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

/** Expand known acronyms so "CCS" and "College Club Swimming" compare equal. */
function expandAcronyms(tokens: string[]): string[] {
  const out: string[] = []
  for (const token of tokens) {
    const expansion = ACRONYM_EXPANSIONS[token]
    if (expansion) out.push(...expansion)
    else out.push(token)
  }
  return out
}

function tokensCompatible(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return true
  }
  const maxLen = Math.max(a.length, b.length)
  if (maxLen <= 4) return false
  const allowed = maxLen <= 7 ? 1 : 2
  return editDistance(a, b) <= allowed
}

/** Match a leftover acronym against consecutive word initials (unknown acronyms). */
function matchAcronymRun(
  acronym: string,
  longer: string[],
  used: Set<number>
): number[] | null {
  if (acronym.length < 2 || acronym.length > 6 || !/^[a-z]+$/.test(acronym)) {
    return null
  }
  for (let start = 0; start <= longer.length - acronym.length; start++) {
    const indices: number[] = []
    let ok = true
    for (let k = 0; k < acronym.length; k++) {
      const i = start + k
      const word = longer[i]
      if (used.has(i) || !word || word[0] !== acronym[k]) {
        ok = false
        break
      }
      indices.push(i)
    }
    if (ok) return indices
  }
  return null
}

function countSoftTokenMatches(shorter: string[], longer: string[]): number {
  let matched = 0
  const used = new Set<number>()

  for (const token of shorter) {
    const direct = longer.findIndex((cand, i) => !used.has(i) && tokensCompatible(token, cand))
    if (direct >= 0) {
      used.add(direct)
      matched += 1
      continue
    }

    const acronymRun = matchAcronymRun(token, longer, used)
    if (acronymRun) {
      for (const i of acronymRun) used.add(i)
      matched += 1
    }
  }

  return matched
}

/**
 * Soft-match meet titles across PDF / SwimPhone / SwimBuzz naming variants.
 * Examples that should match: "GTSC Yellow Jacket Invitational" ↔ "Yellow Jacket Invite",
 * "2025 Tiger Town Invitational Fall" ↔ "Tiger Town Invitational",
 * "2026 TYR CCS National Championship" ↔ "College Club Swimming National Championships".
 */
export function meetNamesSoftMatch(expected: string, actual: string): boolean {
  const left = normalizeMeetNameForMatch(expected)
  const right = normalizeMeetNameForMatch(actual)
  if (!left || !right) return true
  if (left === right) return true
  if (left.includes(right) || right.includes(left)) return true

  const aTokens = expandAcronyms(significantTokens(expected))
  const bTokens = expandAcronyms(significantTokens(actual))
  if (aTokens.length === 0 || bTokens.length === 0) return true

  const [shorter, longer] =
    aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens]

  const matched = countSoftTokenMatches(shorter, longer)

  // Majority of the shorter title's significant tokens must align (sponsors/years
  // already stripped; acronyms expanded).
  const needed =
    shorter.length <= 2 ? shorter.length : Math.max(2, Math.ceil(shorter.length * 0.55))
  if (matched >= needed) return true

  const maxLen = Math.max(left.length, right.length)
  if (maxLen >= 10) {
    const ratio = 1 - editDistance(left, right) / maxLen
    if (ratio >= 0.72) return true
  }

  return false
}

export function assertMeetNameMatches(
  expectedMeetName: string | null | undefined,
  parsedMeetName: string | null | undefined,
  sourceLabel = "file"
): void {
  const expected = expectedMeetName?.trim()
  const actual = parsedMeetName?.trim()
  if (!expected || !actual) return
  if (meetNamesSoftMatch(expected, actual)) return
  throw new MeetImportValidationError(
    `This ${sourceLabel} appears to be for "${actual}", but this meet is named "${expected}".`
  )
}

function isMeetDocType(value: string): value is MeetDocType {
  return value === "psych" || value === "heat" || value === "entries" || value === "results"
}

export function assertDocTypeMatches(
  expected: MeetDocType,
  detected: string | null | undefined
): void {
  if (!detected || detected === "unknown") return
  if (!isMeetDocType(detected)) return
  if (detected === expected) return
  throw new MeetImportValidationError(
    `Expected a ${DOC_TYPE_LABELS[expected]}, but the PDF looks like a ${DOC_TYPE_LABELS[detected]}.`
  )
}
