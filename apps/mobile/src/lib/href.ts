import type { Href } from "expo-router"

/**
 * Map web-style notification hrefs to Expo Router paths.
 * Returns null for unknown or external http(s) URLs that are not app routes.
 */
export function resolveAppHref(href: string | null | undefined): Href | null {
  if (!href) return null
  const raw = href.trim()
  if (!raw) return null

  let path = raw
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      path = u.pathname + u.search
    }
  } catch {
    return null
  }

  const normalized = path.startsWith("/") ? path : `/${path}`
  const [pathname, query = ""] = normalized.split("?")
  const qs = query ? `?${query}` : ""

  if (pathname === "/" || pathname === "") return "/(tabs)"
  if (pathname === "/qualifiers" || pathname.startsWith("/qualifiers/")) {
    return `/(tabs)/nationals${qs}` as Href
  }
  if (pathname === "/meets" || pathname === "/meets/") {
    return "/(tabs)/meets"
  }
  if (pathname.startsWith("/meets/")) {
    const id = pathname.slice("/meets/".length).split("/")[0]
    if (id) return `/(tabs)/meets/${id}${qs}` as Href
  }
  if (pathname === "/practices" || pathname === "/practices/") {
    return "/(tabs)/practices"
  }
  if (pathname.startsWith("/practices/")) {
    const id = pathname.slice("/practices/".length).split("/")[0]
    if (id && id !== "new") return `/(tabs)/practices/${id}${qs}` as Href
  }
  if (pathname === "/athletes" || pathname === "/athletes/") {
    return "/(tabs)/roster"
  }
  if (pathname.startsWith("/athletes/")) {
    const id = pathname.slice("/athletes/".length).split("/")[0]
    if (id) return `/(tabs)/roster/${id}${qs}` as Href
  }
  if (pathname === "/settings" || pathname.startsWith("/settings")) {
    return "/(tabs)/settings"
  }
  if (pathname === "/notifications" || pathname.startsWith("/notifications")) {
    return "/(tabs)/notifications"
  }

  return null
}

/** True external URL (live stream, PDF, maps) — open with Linking. */
export function isExternalUrl(href: string | null | undefined): boolean {
  if (!href) return false
  return /^https?:\/\//i.test(href.trim())
}
