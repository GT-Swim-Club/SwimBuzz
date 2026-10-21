import { relaySignupKey } from "@/lib/swim/swim-parse"

export type RelayDraftGender = "M" | "F" | "X"

export type RelayDraftLeg = {
  athleteId: string
  /** Leg time when the draft was saved; null = no time on record (NT). */
  timeMs: number | null
  /** Coach-entered time rather than a swim on record. */
  custom?: boolean
}

export type RelayDraftTeam = { letter: string; legs: RelayDraftLeg[] }

/** A relay builder lineup saved on the meet but not published to the roster summary. */
export type RelayDraft = {
  gender: RelayDraftGender
  event: string
  teams: RelayDraftTeam[]
  savedAt: string
}

export type RelayDraftsSummary = { drafts: RelayDraft[] }

const LETTERS = ["A", "B", "C", "D"]

function isDraftGender(value: unknown): value is RelayDraftGender {
  return value === "M" || value === "F" || value === "X"
}

function parseLeg(raw: unknown): RelayDraftLeg | null {
  if (!raw || typeof raw !== "object") return null
  const leg = raw as Record<string, unknown>
  const athleteId = typeof leg.athleteId === "string" ? leg.athleteId.trim() : ""
  if (!athleteId) return null
  const timeMs = typeof leg.timeMs === "number" && Number.isFinite(leg.timeMs) && leg.timeMs > 0
    ? Math.round(leg.timeMs)
    : null
  return { athleteId, timeMs, ...(leg.custom === true && timeMs != null ? { custom: true } : {}) }
}

/**
 * Validated teams from a request body: 1–4 lettered teams of four swimmers each, no swimmer twice
 * on the same relay (same rule as publishing). Returns an error message when invalid.
 */
export function parseRelayDraftTeams(raw: unknown): { teams: RelayDraftTeam[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > LETTERS.length) {
    return { error: "A draft needs one to four relays" }
  }
  const teams: RelayDraftTeam[] = []
  const seenLetters = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== "object") return { error: "Invalid relay" }
    const team = item as Record<string, unknown>
    const letter = String(team.letter ?? "").trim().toUpperCase()
    if (!LETTERS.includes(letter) || seenLetters.has(letter)) {
      return { error: "Each relay needs its own letter (A–D)" }
    }
    seenLetters.add(letter)
    const legs = Array.isArray(team.legs) ? team.legs.map(parseLeg) : []
    if (legs.length !== 4 || legs.some((leg) => leg == null)) {
      return { error: `The ${letter} relay needs four swimmers` }
    }
    if (new Set((legs as RelayDraftLeg[]).map((leg) => leg.athleteId)).size !== 4) {
      return { error: `A swimmer is on the ${letter} relay twice` }
    }
    teams.push({ letter, legs: legs as RelayDraftLeg[] })
  }
  return { teams: teams.sort((a, b) => a.letter.localeCompare(b.letter)) }
}

export function isRelayDraftsSummary(value: unknown): value is RelayDraftsSummary {
  if (!value || typeof value !== "object") return false
  const drafts = (value as { drafts?: unknown }).drafts
  return (
    Array.isArray(drafts) &&
    drafts.every(
      (d) =>
        d &&
        typeof d === "object" &&
        isDraftGender((d as RelayDraft).gender) &&
        typeof (d as RelayDraft).event === "string" &&
        Array.isArray((d as RelayDraft).teams)
    )
  )
}

export function relayDraftsOf(value: unknown): RelayDraft[] {
  return isRelayDraftsSummary(value) ? value.drafts : []
}

function sameRelay(draft: Pick<RelayDraft, "gender" | "event">, gender: string, event: string) {
  return draft.gender === gender && relaySignupKey(draft.event) === relaySignupKey(event)
}

export function upsertRelayDraft(drafts: RelayDraft[], draft: RelayDraft): RelayDraft[] {
  return [...drafts.filter((d) => !sameRelay(d, draft.gender, draft.event)), draft]
}

export function removeRelayDraft(drafts: RelayDraft[], gender: string, event: string): RelayDraft[] {
  return drafts.filter((d) => !sameRelay(d, gender, event))
}

export function parseRelayDraftGender(value: unknown): RelayDraftGender | null {
  return isDraftGender(value) ? value : null
}
