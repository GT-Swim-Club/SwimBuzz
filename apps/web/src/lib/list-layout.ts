export type ListLayout = "gallery" | "list"

/**
 * Pages with a List/Gallery toggle. Each remembers the layout the user last
 * switched to in its own cookie — read server-side (list-layout-server.ts) so
 * the page and its loading skeleton render in that layout with no flash.
 */
const COOKIES = {
  meets: "swimbuzz-meets-layout",
  roster: "swimbuzz-roster-layout",
  nationals: "swimbuzz-nationals-layout",
} as const

export type ListLayoutPage = keyof typeof COOKIES

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export function listLayoutCookie(page: ListLayoutPage) {
  return COOKIES[page]
}

export function parseListLayout(value: string | null | undefined): ListLayout {
  return value === "gallery" ? "gallery" : "list"
}

export const LIST_LAYOUT_PAGES = Object.keys(COOKIES) as ListLayoutPage[]

/** Client-only: the layout last saved for `page`, read straight from its cookie. */
export function readSavedListLayout(page: ListLayoutPage): ListLayout {
  const prefix = `${COOKIES[page]}=`
  const entry = document.cookie.split("; ").find((c) => c.startsWith(prefix))
  return parseListLayout(entry?.slice(prefix.length))
}

/** Client-only: remember `layout` as this page's default for next time. */
export function saveListLayout(page: ListLayoutPage, layout: ListLayout) {
  document.cookie = `${COOKIES[page]}=${layout}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
}
