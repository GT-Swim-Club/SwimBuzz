/**
 * Meet sessions ("Saturday Prelims", "Sunday Finals") from the packet's order of events, for
 * filtering the roster summary to one session. Entries don't carry a session, so a row belongs to
 * one when its event number is listed there and, for a prelims or finals session, it's that round.
 */

export type MeetSessionOrder = {
  sessions: Array<{
    label: string
    rows: Array<{ women: number | null; event: string; men: number | null }>
  }>
}

export type SessionRound = "P" | "F"

/** A summary row as the session filter sees it. */
export type SessionRow = {
  /** The event number the row shows (0 or missing when it has none). */
  eventNumber?: number
  event: string
  gender?: string | null
  /**
   * The rounds the row stands for: one on web (rows split per round), possibly both on mobile.
   * Empty when unknown — a seed before any heat sheet, or a timed final.
   */
  rounds: SessionRound[]
}

/**
 * The round a session label names: "Sunday Finals" → F, "Day 1 Prelims" → P. A label naming both
 * ("Sunday (Prelims/Finals)") or neither ("Saturday", "Timed Finals") holds every round.
 */
export function sessionRound(label: string): SessionRound | null {
  const prelims = /\bprelim/i.test(label)
  // Timed finals have no prelims to tell apart, so they don't make a finals session.
  const finals = /\bfinal/i.test(label.replace(/\btimed\s+finals?\b/gi, ""))
  if (prelims === finals) return null
  return prelims ? "P" : "F"
}

/** Sessions worth filtering by: named ones, and only when the packet lists more than one. */
export function rosterSummarySessions(order: MeetSessionOrder | null | undefined): string[] {
  const sessions = order?.sessions ?? []
  const named = sessions.filter((s) => s.rows.length > 0 && s.label.trim().toLowerCase() !== "order of events")
  return named.length === sessions.length && named.length >= 2 ? named.map((s) => s.label) : []
}

/** Loose event-name key for rows without a number: "50 Yard Freestyle" ~ "50 Free". */
function eventKey(event: string): string {
  return event
    .toLowerCase()
    .replace(/\b(women'?s?|men'?s?|girls'?|boys'?|mixed|co-?ed)\b/g, "")
    .replace(/\b(yards?|yd|meters?|m|lcm|scy|scm)\b/g, "")
    .replace(/\bfreestyle\b/g, "free")
    .replace(/\bbackstroke\b/g, "back")
    .replace(/\bbreast?stroke\b/g, "breast")
    .replace(/\bbutterfly\b/g, "fly")
    .replace(/\bindividual\s+medley\b/g, "im")
    .replace(/[^a-z0-9]/g, "")
}

function sessionListsRow(
  session: MeetSessionOrder["sessions"][number],
  row: SessionRow
): boolean {
  const number = row.eventNumber && row.eventNumber > 0 ? row.eventNumber : null
  if (number == null) {
    const key = eventKey(row.event)
    return Boolean(key) && session.rows.some((r) => eventKey(r.event) === key)
  }
  return session.rows.some((r) =>
    row.gender === "F"
      ? r.women === number
      : row.gender === "M"
        ? r.men === number
        : r.women === number || r.men === number
  )
}

/** Whether `row` belongs to the session named `label`. */
export function sessionIncludes(order: MeetSessionOrder, label: string, row: SessionRow): boolean {
  const session = order.sessions.find((s) => s.label === label)
  if (!session || !sessionListsRow(session, row)) return false
  const round = sessionRound(session.label)
  if (!round) return true
  if (row.rounds.length > 0) return row.rounds.includes(round)
  // No known round: with the event in both a prelims and a finals session, it's a prelims entry
  // that hasn't swum yet; otherwise (a timed final) the event number alone places it.
  const other: SessionRound = round === "P" ? "F" : "P"
  const inOtherRound = order.sessions.some(
    (s) => s !== session && sessionRound(s.label) === other && sessionListsRow(s, row)
  )
  return !inOtherRound || round === "P"
}

/** A summary row's round, for the round filter: prelims, finals or timed finals. */
export type SummaryRoundKind = "P" | "F" | "T"

export const SUMMARY_ROUNDS: ReadonlyArray<{ kind: SummaryRoundKind; label: string }> = [
  { kind: "P", label: "Prelims" },
  { kind: "F", label: "Finals" },
  { kind: "T", label: "Timed Finals" },
]

/** A row with no known round — a seed that hasn't swum yet — counts as prelims or timed finals, never finals. */
const UNKNOWN_ROUND_KINDS: SummaryRoundKind[] = ["P", "T"]

/**
 * Whether a row survives the round filter: rows of a hidden round drop out, and a row standing for
 * several rounds stays while any of them is shown. Only the meet's `available` rounds count, so a
 * row with no round follows Prelims at a prelims/finals meet and Timed Finals at a timed-finals one.
 */
export function roundFilterIncludes(
  hidden: ReadonlySet<SummaryRoundKind>,
  kinds: SummaryRoundKind[],
  available: SummaryRoundKind[]
): boolean {
  if (hidden.size === 0) return true
  const own = (kinds.length > 0 ? kinds : UNKNOWN_ROUND_KINDS).filter((kind) => available.includes(kind))
  return own.length === 0 || own.some((kind) => !hidden.has(kind))
}

/** The shown rounds for the export heading ("Finals", "Prelims & Timed Finals"), or null when all are. */
export function roundFilterLabel(
  hidden: ReadonlySet<SummaryRoundKind>,
  available: SummaryRoundKind[]
): string | null {
  const shown = SUMMARY_ROUNDS.filter((r) => available.includes(r.kind) && !hidden.has(r.kind))
  if (shown.length === available.length) return null
  return shown.map((r) => r.label).join(" & ") || "No rounds"
}

/**
 * The session and shown rounds as one phrase for the search placeholder: "Sunday Finals" for
 * "Sunday (Prelim/Final)" with only finals shown. A session's parenthetical round note is dropped,
 * and a round its name already says isn't repeated. Null when neither is filtered.
 */
export function rosterSummaryScopeLabel(session: string | null, rounds: string | null): string | null {
  const day = session?.replace(/\s*\((?=[^)]*\b(?:prelim|final))[^)]*\)\s*$/i, "").trim() || null
  const roundsPart = rounds && !(day ?? "").toLowerCase().includes(rounds.toLowerCase()) ? rounds : null
  return [day, roundsPart].filter(Boolean).join(" ") || null
}
