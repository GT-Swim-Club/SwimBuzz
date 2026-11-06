import { coerceTeamScores, type TeamScores } from "./team-scores"

/** Carousel pages that hold their own counters, ahead of the counters paged by shape. */
export type StatCounterPage = "teamScores" | "topScorers"

export type StatCounter = {
  label: string
  value: string | number
  hint?: string
  /** A second line under the hint (a team score's margin). */
  detail?: string
  page?: StatCounterPage
}

export type StatSpotlight = {
  text: string
  href?: string
  /** Substring of `text` to wrap in a link when `href` is set. */
  linkLabel?: string
}

export type MeetHighlights = {
  counters: StatCounter[]
  spotlight?: StatSpotlight | null
  /** Full standings behind the team scores page. */
  teamScores?: TeamScores | null
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
      ...(typeof c.page === "string" && COUNTER_PAGES.has(c.page)
        ? { page: c.page as StatCounterPage }
        : {}),
    })
  }
  if (counters.length === 0) return null
  return { counters, teamScores: coerceTeamScores(r.teamScores) }
}
