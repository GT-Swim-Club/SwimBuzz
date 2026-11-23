import { coerceTeamScores, type TeamScores, type TeamScoresSection } from "./team-scores"

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
  /** The standings a team score is from (opens them); older payloads match on the label instead. */
  section?: TeamScoresSection
  page?: StatCounterPage
  /** The export row it shares with its group: results (swimmers, records, places) or swims (PBs, cuts, standouts). */
  row?: StatCounterRow
  /** Exports set the hint on the label's line, after a dot ("BUSIEST · 12 races"), when it fits. */
  hintBesideLabel?: boolean
}

export type StatCounterRow = "results" | "swims"

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

/** A GTSC team record set at this meet (it still counts once a later meet breaks it). */
export type MeetRecord = {
  /** "X" for the mixed relay. */
  gender: "F" | "M" | "X"
  /** "100 Free", "200 Free Relay". */
  event: string
  /** The holder, or a relay's swimmers in leg order. */
  swimmers: string[]
  /** Set leading off a relay — "(R)" after the holder. */
  leadoff?: boolean
  time: string
  /** The record it broke, when there was one. */
  previous?: { time: string; year: number; holder?: string }
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
  /** GTSC records set here — the "GTSC Records" counter and the Results exports' section. */
  records?: MeetRecord[]
  /**
   * At a meet with several of our teams (an intrasquad's Gold and White), each team's own
   * highlights, in standings order. The counters above stay meet-wide (older app builds show them);
   * when this is set, clients show the team score cards above, then each team's section.
   */
  teams?: MeetTeamHighlights[]
}

/** One of our teams' highlights at a meet with several (no team score cards: those stay meet-wide). */
export type MeetTeamHighlights = {
  /** The team's side ("Gold"), its section's heading. */
  team: string
  counters: StatCounter[]
  newNationalsCuts: NewNationalsCut[]
  topScorers: TopScorer[]
  wins: MeetWin[]
  records: MeetRecord[]
}

export type HighlightsPage = {
  kind: StatCounterPage | "stats"
  counters: StatCounter[]
  /** The team whose highlights the page shows ("Gold"), at a meet split by team. */
  team?: string
}

const PAGE_ORDER: StatCounterPage[] = ["teamScores", "topScorers"]
const COUNTER_ROWS: StatCounterRow[] = ["results", "swims"]

/** A tie this many names long ("Ann Lee, Bo Kim, Cy Diaz, & Di Fox") gets a carousel page to itself. */
const OWN_PAGE_NAMES = 4

/** How many names a counter's value lists ("Ann Lee, Bo Kim, & Cy Diaz" is 3; a number or time is 1). */
function counterNameCount(value: string | number): number {
  if (typeof value !== "string") return 1
  return value.split(/,\s*&\s+|,\s+|\s+&\s+/).length
}

/**
 * The highlights carousel's pages: team scores, then top scorers, then plain counters
 * three-up and counters with a hint line two-up (they need more room). A long tie (Most PBs
 * shared by four or more) takes a page alone rather than squeezing beside another counter.
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
  let pair: StatCounter[] = []
  for (const counter of hinted) {
    if (counterNameCount(counter.value) >= OWN_PAGE_NAMES) {
      pages.push({ kind: "stats", counters: [counter] })
      continue
    }
    pair.push(counter)
    if (pair.length === 2) {
      pages.push({ kind: "stats", counters: pair })
      pair = []
    }
  }
  if (pair.length) pages.push({ kind: "stats", counters: pair })
  return pages
}

/**
 * The carousel's pages for a meet's highlights: as paginateHighlights, or at a meet split by team,
 * the team score cards first, then each team's pages (top scorers, then stats) tagged with the team.
 */
export function paginateMeetHighlights(highlights: MeetHighlights): HighlightsPage[] {
  const teams = highlights.teams ?? []
  if (teams.length < 2) return paginateHighlights(highlights.counters)
  return [
    ...paginateHighlights(highlights.counters.filter((c) => c.page === "teamScores")),
    ...teams.flatMap((team) =>
      paginateHighlights(team.counters.filter((c) => c.page !== "teamScores")).map((page) => ({ ...page, team: team.team }))
    ),
  ]
}

/** A row of highlight tiles, each `1 / perRow` of the row's width (a short row leaves room after it). */
export type HighlightTileRow = { counters: StatCounter[]; perRow: number }

/**
 * The highlights as rows of tiles for an export: team scores three to a row, then the results row
 * (swimmers, GTSC records, wins, podiums, top 8s) and the swims row (PBs, new cuts, standouts) each
 * whole on one row, then any other counters — plain ones `plainPerRow` to a row (four, or six to keep
 * a page's highlights to three rows) and ones with a hint three. Top scorers are left out — an
 * export lists its top five instead.
 */
export function highlightTileRows(counters: StatCounter[], plainPerRow = 4): HighlightTileRow[] {
  const rows: HighlightTileRow[] = []
  const chunk = (list: StatCounter[], perRow: number) => {
    for (let i = 0; i < list.length; i += perRow) rows.push({ counters: list.slice(i, i + perRow), perRow })
  }
  rows.push(...teamScoreTileRows(counters.filter((c) => c.page === "teamScores")))
  const rest = counters.filter((c) => !c.page)
  for (const row of COUNTER_ROWS) {
    const grouped = rest.filter((c) => c.row === row)
    if (grouped.length) rows.push({ counters: grouped, perRow: grouped.length })
  }
  const ungrouped = rest.filter((c) => !c.row)
  chunk(ungrouped.filter((c) => !c.hint), plainPerRow)
  chunk(ungrouped.filter((c) => c.hint), 3)
  return rows
}

const TEAM_SCORE_COLUMNS: TeamScoresSection[] = ["women", "men", "combined"]

/**
 * Team score tiles as rows: Women, Men and Combined as columns. With several of our teams (an
 * intrasquad's "Gold · Women", "White · Women", …) each team gets a row, in its combined standings
 * order (else the order its tiles first come in), so a column reads one standings list. Tiles without
 * a known section, or one team's alone, go three to a row as they come.
 */
function teamScoreTileRows(scores: StatCounter[]): HighlightTileRow[] {
  const sectioned = scores.every((c) => c.section != null)
  const teamOf = (c: StatCounter) => (c.label.includes(" · ") ? c.label.split(" · ")[0]!.trim() : "")
  const teams: string[] = []
  const firstIn = (list: StatCounter[]) => {
    for (const c of list) if (!teams.includes(teamOf(c))) teams.push(teamOf(c))
  }
  firstIn(scores.filter((c) => c.section === "combined"))
  firstIn(scores)
  if (!sectioned || teams.length < 2) {
    const rows: HighlightTileRow[] = []
    for (let i = 0; i < scores.length; i += 3) rows.push({ counters: scores.slice(i, i + 3), perRow: 3 })
    return rows
  }
  const columns = TEAM_SCORE_COLUMNS.filter((section) => scores.some((c) => c.section === section))
  return teams.map((team) => ({
    counters: columns.flatMap((section) => scores.filter((c) => c.section === section && teamOf(c) === team)),
    perRow: columns.length,
  }))
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
  const counters = coerceStatCounters(r.counters)
  if (counters.length === 0) return null
  const teams = coerceMeetTeamHighlights(r.teams)
  return {
    counters,
    teamScores: coerceTeamScores(r.teamScores),
    newNationalsCuts: coerceNewNationalsCuts(r.newNationalsCuts),
    topScorers: coerceTopScorers(r.topScorers),
    wins: coerceMeetWins(r.wins),
    records: coerceMeetRecords(r.records),
    ...(teams.length > 1 ? { teams } : {}),
  }
}

/** Each team's highlights from an API response or export request, dropping any malformed one. */
export function coerceMeetTeamHighlights(raw: unknown): MeetTeamHighlights[] {
  if (!Array.isArray(raw)) return []
  const teams: MeetTeamHighlights[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const t = item as Record<string, unknown>
    if (typeof t.team !== "string" || !t.team.trim()) continue
    teams.push({
      team: t.team.trim(),
      counters: coerceStatCounters(t.counters),
      newNationalsCuts: coerceNewNationalsCuts(t.newNationalsCuts),
      topScorers: coerceTopScorers(t.topScorers),
      wins: coerceMeetWins(t.wins),
      records: coerceMeetRecords(t.records),
    })
  }
  return teams
}

/** Counters from an API response or export request, dropping any malformed one. */
export function coerceStatCounters(raw: unknown): StatCounter[] {
  if (!Array.isArray(raw)) return []
  const counters: StatCounter[] = []
  for (const item of raw) {
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
      ...(c.section === "women" || c.section === "men" || c.section === "combined" ? { section: c.section } : {}),
      ...(typeof c.page === "string" && COUNTER_PAGES.has(c.page)
        ? { page: c.page as StatCounterPage }
        : {}),
      ...(c.row === "results" || c.row === "swims" ? { row: c.row } : {}),
      ...(c.hintBesideLabel === true ? { hintBesideLabel: true } : {}),
    })
  }
  return counters
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

/** GTSC records from an API response or export request, dropping any malformed row. */
export function coerceMeetRecords(raw: unknown): MeetRecord[] {
  if (!Array.isArray(raw)) return []
  const records: MeetRecord[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const c = item as Record<string, unknown>
    if (c.gender !== "F" && c.gender !== "M" && c.gender !== "X") continue
    if (!isString(c.event) || !isString(c.time)) continue
    const swimmers = Array.isArray(c.swimmers) ? c.swimmers.filter(isString) : []
    const p = c.previous && typeof c.previous === "object" ? (c.previous as Record<string, unknown>) : null
    const previous =
      p && isString(p.time) && typeof p.year === "number" && Number.isInteger(p.year)
        ? { time: p.time, year: p.year, ...(isString(p.holder) ? { holder: p.holder } : {}) }
        : undefined
    records.push({
      gender: c.gender,
      event: c.event,
      swimmers,
      ...(c.leadoff === true ? { leadoff: true } : {}),
      time: c.time,
      ...(previous ? { previous } : {}),
    })
  }
  return records
}
