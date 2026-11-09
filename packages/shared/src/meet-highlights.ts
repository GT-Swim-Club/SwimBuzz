import { coerceTeamScores, type TeamScores } from "./team-scores"

/** Carousel pages that hold their own counters, ahead of the counters paged by shape. */
export type StatCounterPage = "teamScores" | "topScorers"

export type StatCounter = {
  label: string
  value: string | number
  hint?: string
  /** A second line under the hint (a team score's margin). */
  detail?: string
  /** Our team's place, on a team score — 1st to 3rd are tinted like a podium finish. */
  place?: number
  page?: StatCounterPage
}

export type StatSpotlight = {
  text: string
  href?: string
  /** Substring of `text` to wrap in a link when `href` is set. */
  linkLabel?: string
}

/** A swim at this meet under the season's Nationals cut, in an event the athlete hadn't made yet. */
export type NewNationalsCut = {
  /** Groups an athlete's cuts (two athletes can share a name). */
  athleteId?: string
  athleteName: string
  gender: "F" | "M"
  event: string
  /** The swim's time and the cut, for display ("1:02.18"). */
  time: string
  cut: string
  /** Time minus cut ("-0.82"). */
  delta: string
}

/** One of the meet's top individual scorers (the Results exports' Top Individual Scorers list). */
export type TopScorer = {
  /** 1-based, ties sharing a rank (1, 2, 2, 4). */
  rank: number
  athleteName: string
  /** Formatted ("60", "12.5"). */
  points: string
  events: number
}

/** An event our team won: an athlete's individual swim, or a relay with its swimmers. */
export type MeetWin = {
  /** "X" for a mixed relay. */
  gender: "F" | "M" | "X"
  /** "100 Free", or the relay with its letter ("200 Free Relay A"). */
  event: string
  /** The swimmer, for an individual win. */
  athleteName?: string
  /** A relay's swimmers in leg order. */
  legs?: string[]
  time: string
  /** Time minus seed ("-0.42"), when there's a seed. */
  delta?: string
  /** 1st, 2nd or 3rd. */
  place: number
}

export type MeetHighlights = {
  counters: StatCounter[]
  spotlight?: StatSpotlight | null
  /** Full standings behind the team scores page. */
  teamScores?: TeamScores | null
  /** First cuts of the season made at this meet — the Results exports' New Nationals Cuts section. */
  newNationalsCuts?: NewNationalsCut[]
  /** The top five individual scorers (more when tied for fifth) — the Results exports' list. */
  topScorers?: TopScorer[]
  /**
   * Podium finishes, individual and relay — the Results exports' Top Performances section: every
   * 1st, 2nd and 3rd when they're fewer than ten, else 1sts and 2nds when those are, else just 1sts.
   */
  wins?: MeetWin[]
}

export type HighlightsPage = { kind: StatCounterPage | "stats"; counters: StatCounter[] }

const PAGE_ORDER: StatCounterPage[] = ["teamScores", "topScorers"]

/**
 * The highlights carousel's pages: team scores, then top scorers, then plain counters
 * three-up and counters with a hint line two-up (they need more room).
 */
export function paginateHighlights(counters: StatCounter[]): HighlightsPage[] {
  const pages: HighlightsPage[] = []
  for (const kind of PAGE_ORDER) {
    const own = counters.filter((c) => c.page === kind)
    if (own.length) pages.push({ kind, counters: own })
  }
  const rest = counters.filter((c) => !c.page)
  const plain = rest.filter((c) => !c.hint)
  const hinted = rest.filter((c) => c.hint)
  for (let i = 0; i < plain.length; i += 3) pages.push({ kind: "stats", counters: plain.slice(i, i + 3) })
  for (let i = 0; i < hinted.length; i += 2) pages.push({ kind: "stats", counters: hinted.slice(i, i + 2) })
  return pages
}

/** A row of highlight tiles, each `1 / perRow` of the row's width (a short row leaves room after it). */
export type HighlightTileRow = { counters: StatCounter[]; perRow: number }

/**
 * The highlights as rows of tiles for an export: team scores three to a row, then plain counters
 * `plainPerRow` to a row (four, or six to keep a page's highlights to three rows) and counters with
 * a hint three. Top scorers are left out — an export lists its top five instead.
 */
export function highlightTileRows(counters: StatCounter[], plainPerRow = 4): HighlightTileRow[] {
  const rows: HighlightTileRow[] = []
  const chunk = (list: StatCounter[], perRow: number) => {
    for (let i = 0; i < list.length; i += perRow) rows.push({ counters: list.slice(i, i + perRow), perRow })
  }
  chunk(counters.filter((c) => c.page === "teamScores"), 3)
  const rest = counters.filter((c) => !c.page)
  chunk(rest.filter((c) => !c.hint), plainPerRow)
  chunk(rest.filter((c) => c.hint), 3)
  return rows
}

/** A counter's value reads as a time drop ("-1.23", "-4.2%"), shown in green. */
export function isDropCounterValue(value: string | number): boolean {
  return typeof value === "string" && /^[-−]/.test(value)
}

const COUNTER_PAGES = new Set<string>(PAGE_ORDER)

/** Highlights from an API response, or null when there are none. */
export function coerceMeetHighlights(raw: unknown): MeetHighlights | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.counters)) return null
  const counters: StatCounter[] = []
  for (const item of r.counters) {
    if (!item || typeof item !== "object") continue
    const c = item as Record<string, unknown>
    if (typeof c.label !== "string") continue
    if (typeof c.value !== "string" && typeof c.value !== "number") continue
    counters.push({
      label: c.label,
      value: c.value,
      ...(typeof c.hint === "string" ? { hint: c.hint } : {}),
      ...(typeof c.detail === "string" ? { detail: c.detail } : {}),
      ...(typeof c.place === "number" && Number.isInteger(c.place) && c.place > 0 ? { place: c.place } : {}),
      ...(typeof c.page === "string" && COUNTER_PAGES.has(c.page)
        ? { page: c.page as StatCounterPage }
        : {}),
    })
  }
  if (counters.length === 0) return null
  return {
    counters,
    teamScores: coerceTeamScores(r.teamScores),
    newNationalsCuts: coerceNewNationalsCuts(r.newNationalsCuts),
    topScorers: coerceTopScorers(r.topScorers),
    wins: coerceMeetWins(r.wins),
  }
}

const isString = (value: unknown): value is string => typeof value === "string"

/** Top scorers from an API response or export request, dropping any malformed row. */
export function coerceTopScorers(raw: unknown): TopScorer[] {
  if (!Array.isArray(raw)) return []
  const scorers: TopScorer[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const c = item as Record<string, unknown>
    if (!isString(c.athleteName) || !isString(c.points)) continue
    if (typeof c.rank !== "number" || typeof c.events !== "number") continue
    scorers.push({ rank: c.rank, athleteName: c.athleteName, points: c.points, events: c.events })
  }
  return scorers
}

/** Wins from an API response or export request, dropping any malformed row. */
export function coerceMeetWins(raw: unknown): MeetWin[] {
  if (!Array.isArray(raw)) return []
  const wins: MeetWin[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const c = item as Record<string, unknown>
    if (c.gender !== "F" && c.gender !== "M" && c.gender !== "X") continue
    if (!isString(c.event) || !isString(c.time)) continue
    const legs = Array.isArray(c.legs) ? c.legs.filter(isString) : []
    wins.push({
      gender: c.gender,
      event: c.event,
      ...(isString(c.athleteName) ? { athleteName: c.athleteName } : {}),
      ...(legs.length ? { legs } : {}),
      time: c.time,
      ...(isString(c.delta) ? { delta: c.delta } : {}),
      place: typeof c.place === "number" && c.place >= 1 && c.place <= 3 ? c.place : 1,
    })
  }
  return wins
}

/** New Nationals cuts from an API response or export request, dropping any malformed row. */
export function coerceNewNationalsCuts(raw: unknown): NewNationalsCut[] {
  if (!Array.isArray(raw)) return []
  const cuts: NewNationalsCut[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const c = item as Record<string, unknown>
    if (c.gender !== "F" && c.gender !== "M") continue
    const fields = [c.athleteName, c.event, c.time, c.cut, c.delta]
    if (!fields.every((f) => typeof f === "string")) continue
    cuts.push({
      ...(typeof c.athleteId === "string" ? { athleteId: c.athleteId } : {}),
      athleteName: c.athleteName as string,
      gender: c.gender,
      event: c.event as string,
      time: c.time as string,
      cut: c.cut as string,
      delta: c.delta as string,
    })
  }
  return cuts
}
