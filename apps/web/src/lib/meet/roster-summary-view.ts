import type { SummaryRoundKind } from "@swimbuzz/shared"

/**
 * The roster summary's view and filters, as kept in the meet page's URL
 * (`?view=event&gender=women&session=Sunday+Finals&hide=p&mine=1&q=smith`). Defaults are left out,
 * so an unfiltered by-athlete view is the bare meet URL. Read on the server for the first paint and
 * written back by the summary with `history.replaceState`.
 */
export type SummaryViewMode = "athlete" | "event" | "roster"
export type SummaryGender = "all" | "F" | "M"

export type SummaryViewState = {
  view: SummaryViewMode
  gender: SummaryGender
  /** A packet session's label, or null for every session. */
  session: string | null
  /** Rounds hidden by the round filter. */
  hiddenRounds: SummaryRoundKind[]
  /** Only the viewer's own events. */
  mine: boolean
  /** The search box. */
  q: string
}

export const DEFAULT_SUMMARY_VIEW: SummaryViewState = {
  view: "athlete",
  gender: "all",
  session: null,
  hiddenRounds: [],
  mine: false,
  q: "",
}

/** The URL parameters the summary owns — any of them present means the URL names a view. */
export const SUMMARY_VIEW_PARAMS = ["view", "gender", "session", "hide", "mine", "q"] as const

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

function readParam(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined
  const value = source[key]
  return Array.isArray(value) ? value[0] : value
}

const ROUND_PARAM: Record<string, SummaryRoundKind> = { p: "P", f: "F", t: "T" }

/** The view a URL names, and whether it names one at all (else the saved view is the fallback). */
export function parseSummaryView(source: ParamSource): { state: SummaryViewState; fromUrl: boolean } {
  const fromUrl = SUMMARY_VIEW_PARAMS.some((key) => readParam(source, key) != null)
  const view = readParam(source, "view")
  const gender = readParam(source, "gender")
  const hide = readParam(source, "hide") ?? ""
  return {
    fromUrl,
    state: {
      view: view === "event" || view === "roster" ? view : "athlete",
      gender: gender === "women" ? "F" : gender === "men" ? "M" : "all",
      session: readParam(source, "session")?.trim() || null,
      hiddenRounds: [
        ...new Set(
          hide
            .split(",")
            .map((part) => ROUND_PARAM[part.trim().toLowerCase()])
            .filter((kind): kind is SummaryRoundKind => Boolean(kind))
        ),
      ],
      mine: readParam(source, "mine") === "1",
      q: readParam(source, "q") ?? "",
    },
  }
}

/**
 * `search` with the summary's parameters set from `state` (defaults removed) and every other
 * parameter kept, as "?…" or "" when nothing is left.
 */
export function summaryViewSearch(state: SummaryViewState, search: string): string {
  const params = new URLSearchParams(search)
  for (const key of SUMMARY_VIEW_PARAMS) params.delete(key)
  if (state.view !== "athlete") params.set("view", state.view)
  if (state.gender !== "all") params.set("gender", state.gender === "F" ? "women" : "men")
  if (state.session) params.set("session", state.session)
  if (state.hiddenRounds.length) {
    params.set(
      "hide",
      (["P", "F", "T"] as const)
        .filter((kind) => state.hiddenRounds.includes(kind))
        .map((kind) => kind.toLowerCase())
        .join(",")
    )
  }
  if (state.mine) params.set("mine", "1")
  if (state.q.trim()) params.set("q", state.q)
  const query = params.toString()
  return query ? `?${query}` : ""
}

/** A server page's `searchParams` as a query string ("?…" or ""), e.g. to keep it across a redirect. */
export function searchParamsString(source: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else if (value != null) params.set(key, value)
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}
