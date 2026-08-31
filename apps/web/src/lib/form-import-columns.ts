import { editDistance } from "@/lib/athlete-match"
import type { MeetSignupQuestion } from "@/lib/meet-signup"
import { normalizeEventName } from "@/lib/swim-parse"

/**
 * Transport-agnostic column mapping for importing Google Form responses into
 * a meet sign-up or roommate-preference form. Headers are free-text question
 * sentences (Google Forms copies the question text verbatim), so mapping is
 * an explicit coach-confirmed step with keyword-suggested defaults rather
 * than the pure keyword inference roster-csv.ts uses for CSV headers.
 */

export type ColumnTarget =
  | { kind: "ignore" }
  | { kind: "timestamp" }
  | { kind: "athleteName" }
  | { kind: "athleteEmail" }
  | { kind: "events" }
  | { kind: "eventTime"; event: string }
  | { kind: "notes" }
  | { kind: "question"; questionId: string }
  | { kind: "preferredRoommates" }
  | { kind: "excludedRoommates" }

export type ColumnMapping = ColumnTarget[]

export type MappingContext = {
  formType: "signup" | "rooms"
  questions: MeetSignupQuestion[]
  /** Sign-up only: canonical event names from the meet's order of events. */
  eventOptions?: string[]
}

const TIME_WORDS = /\b(seed|time|entry)\b/i

function normalizeHeaderText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function headerMatchesQuestion(header: string, label: string): boolean {
  const h = normalizeHeaderText(header)
  const l = normalizeHeaderText(label)
  if (!h || !l) return false
  if (h === l) return true
  const maxLen = Math.max(h.length, l.length)
  if (maxLen <= 8) return false
  return editDistance(h, l) <= Math.floor(maxLen * 0.15)
}

function findEventInHeader(header: string, eventOptions: string[]): string | null {
  const h = header.toLowerCase()
  let best: { event: string; len: number } | null = null
  for (const event of eventOptions) {
    const needle = event.toLowerCase()
    if (needle && h.includes(needle) && (!best || needle.length > best.len)) {
      best = { event, len: needle.length }
    }
  }
  return best?.event ?? null
}

/** Prefer GT / "email address" columns when several headers look like email — mirrors roster-csv.ts's emailHeaderScore. */
function emailHeaderScore(header: string): number {
  const h = normalizeHeaderText(header)
  if (h.includes("georgia tech") || h.includes("gatech")) return 3
  if (h.includes("email address") || h.includes("e-mail address")) return 2
  if (h.includes("email") || h.includes("e-mail")) return 1
  return 0
}

/**
 * Suggest a default target for each header column. Order of heuristics:
 * question label match (highest signal) > event+seed-time column > generic
 * events column > roommate preference/exclusion column > notes > email >
 * name > timestamp > ignore.
 */
export function suggestColumnMapping(headers: string[], ctx: MappingContext): ColumnMapping {
  const emailScores = headers.map((h) => emailHeaderScore(h))
  const bestEmailScore = Math.max(0, ...emailScores)
  const bestEmailIndex = bestEmailScore > 0 ? emailScores.indexOf(bestEmailScore) : -1

  return headers.map((header, index): ColumnTarget => {
    const trimmed = header.trim()
    if (!trimmed) return { kind: "ignore" }

    const question = ctx.questions.find((q) => headerMatchesQuestion(trimmed, q.label))
    if (question) return { kind: "question", questionId: question.id }

    if (ctx.formType === "signup" && ctx.eventOptions?.length) {
      const event = findEventInHeader(trimmed, ctx.eventOptions)
      if (event && TIME_WORDS.test(trimmed)) return { kind: "eventTime", event }
    }

    if (ctx.formType === "signup" && /\bevents?\b/i.test(trimmed)) {
      return { kind: "events" }
    }

    if (ctx.formType === "rooms") {
      if (/\b(not|avoid|don'?t|exclu)\w*\b.*\broom/i.test(trimmed) || /\bexclu\w*/i.test(trimmed)) {
        return { kind: "excludedRoommates" }
      }
      if (/\broommate/i.test(trimmed) || /\broom\s*(with|mate|pick|preference)/i.test(trimmed)) {
        return { kind: "preferredRoommates" }
      }
    }

    if (/\b(note|comment|anything else|else we should know)\b/i.test(trimmed)) {
      return { kind: "notes" }
    }

    if (index === bestEmailIndex) return { kind: "athleteEmail" }

    if (/\bname\b/i.test(trimmed) && !/nick\s*name/i.test(trimmed)) {
      return { kind: "athleteName" }
    }

    if (/timestamp/i.test(trimmed)) return { kind: "timestamp" }

    return { kind: "ignore" }
  })
}

/** True when a cell looks like a single "Last, First" name rather than a comma-joined list. */
function looksLikeLastFirstName(value: string): boolean {
  const parts = value.split(",")
  if (parts.length !== 2) return false
  const [last, first] = parts.map((p) => p.trim())
  if (!last || !first) return false
  const nameLike = /^[A-Za-z][A-Za-z'.\- ]*$/
  return nameLike.test(last) && nameLike.test(first) && first.split(/\s+/).length <= 3
}

/**
 * Split a form cell into individual values. Always splits on newlines and
 * semicolons; splits on commas too, unless the whole segment looks like a
 * single "Last, First" name (Google Forms commonly asks roommate picks as
 * free text, sometimes split across several "Preference 1/2/3" columns).
 */
export function splitMultiValueCell(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []
  const segments = trimmed.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean)
  return segments.flatMap((segment) => {
    if (looksLikeLastFirstName(segment)) return [segment]
    return segment.split(",").map((s) => s.trim()).filter(Boolean)
  })
}

export function isColumnMappingValid(mapping: ColumnMapping): { ok: true } | { ok: false; error: string } {
  const hasIdentity = mapping.some((t) => t.kind === "athleteName" || t.kind === "athleteEmail")
  if (!hasIdentity) {
    return { ok: false, error: "Map at least one column to the athlete's name or email" }
  }
  return { ok: true }
}

/** Stable string key for a target, used to group raw cell values by mapped field. */
export function targetKey(target: ColumnTarget): string {
  switch (target.kind) {
    case "eventTime":
      return `eventTime:${normalizeEventName(target.event)}`
    case "question":
      return `question:${target.questionId}`
    default:
      return target.kind
  }
}

/** Group each row's raw cell values by mapped target, in column order. */
export function collectMappedValues(
  headers: string[],
  mapping: ColumnMapping,
  row: string[]
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  mapping.forEach((target, index) => {
    if (target.kind === "ignore") return
    const value = (row[index] ?? "").trim()
    if (!value) return
    const key = targetKey(target)
    const arr = out.get(key)
    if (arr) arr.push(value)
    else out.set(key, [value])
  })
  return out
}

export type ColumnTargetOption = { target: ColumnTarget; label: string }

/** Pickable target catalog for the mapping-step dropdowns. */
export function buildTargetCatalog(ctx: MappingContext): ColumnTargetOption[] {
  const options: ColumnTargetOption[] = [
    { target: { kind: "ignore" }, label: "Ignore this column" },
    { target: { kind: "timestamp" }, label: "Timestamp" },
    { target: { kind: "athleteName" }, label: "Athlete name" },
    { target: { kind: "athleteEmail" }, label: "Athlete email" },
  ]

  if (ctx.formType === "signup") {
    options.push({ target: { kind: "events" }, label: "Events (comma-separated)" })
    for (const event of ctx.eventOptions ?? []) {
      options.push({ target: { kind: "eventTime", event }, label: `${event} — seed time` })
    }
  } else {
    options.push({ target: { kind: "preferredRoommates" }, label: "Preferred roommates" })
    options.push({ target: { kind: "excludedRoommates" }, label: "Excluded roommates" })
  }

  options.push({ target: { kind: "notes" }, label: "Notes" })
  for (const q of ctx.questions) {
    options.push({ target: { kind: "question", questionId: q.id }, label: q.label })
  }

  return options
}

/** Parse a form timestamp cell into a comparable number, or null when unparseable. */
export function parseTimestampValue(raw: string): number | null {
  if (!raw.trim()) return null
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : null
}
