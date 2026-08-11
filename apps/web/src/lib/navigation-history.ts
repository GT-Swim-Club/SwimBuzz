export const NAV_CURR_KEY = "swimbuzz-curr-path"
export const NAV_CURR_LABEL_KEY = "swimbuzz-curr-label"
export const NAV_BACK_TARGETS_KEY = "swimbuzz-back-targets"

export type BackTarget = { href: string; label: string }

export function buildFullPath(pathname: string, search?: string) {
  return search ? `${pathname}?${search}` : pathname
}

export function setCurrentPageLabel(label: string) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(NAV_CURR_LABEL_KEY, label)
}

function readBackTargets(): Record<string, BackTarget> {
  if (typeof window === "undefined") return {}
  try {
    const raw = sessionStorage.getItem(NAV_BACK_TARGETS_KEY)
    return raw ? (JSON.parse(raw) as Record<string, BackTarget>) : {}
  } catch {
    return {}
  }
}

function writeBackTargets(targets: Record<string, BackTarget>) {
  if (typeof window === "undefined") return
  sessionStorage.setItem(NAV_BACK_TARGETS_KEY, JSON.stringify(targets))
}

export function getBackTarget(path: string): BackTarget | null {
  return readBackTargets()[path] ?? null
}

/** True when leaving `from` for `to` via back (browser or in-app). */
export function isBackNavigation(from: string, to: string): boolean {
  const target = getBackTarget(from)
  return target?.href === to
}

export function setBackTarget(path: string, target: BackTarget) {
  const targets = readBackTargets()
  targets[path] = target
  writeBackTargets(targets)
}

export function isSafeInternalPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//")
}

/** Human-readable label for a back-navigation target. */
export function formatBackLabel(
  path: string,
  fallbackLabel: string,
  storedLabel?: string | null
): string {
  if (!isSafeInternalPath(path)) return fallbackLabel

  const pathname = path.split("?")[0] ?? path
  const segments = pathname.split("/").filter(Boolean)

  if (segments.length === 0) return "Home"

  switch (segments[0]) {
    case "athletes":
      return segments.length === 1 ? "Roster" : "Athlete"
    case "meets":
      if (segments.length > 1 && storedLabel) return storedLabel
      return segments.length === 1 ? "Meets" : "Meet"
    case "practices":
      if (segments[1] === "new") return "New practice"
      return segments.length === 1 ? "Practices" : "Practice"
    case "qualifiers":
      return "Nationals"
    case "settings":
      return "Settings"
    case "signin":
      return "Sign in"
    default:
      return fallbackLabel
  }
}
