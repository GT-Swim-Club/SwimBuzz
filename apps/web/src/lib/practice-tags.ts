// Initial shared practice-tag catalog. Coaches can add and remove catalog entries
// from the Practices page; every practice editor consumes that shared catalog.
export const PRACTICE_TAG_NAME_MAX_LENGTH = 10
export const PRACTICE_TAG_MAX_COUNT = 20

export const DEFAULT_PRACTICE_TAGS = [
  "Warmup",
  "Prep",
  "Drill",
  "Kick",
  "Pull",
  "Aerobic",
  "Threshold",
  "VO2 Max",
  "Sprint",
  "Race Pace",
  "IM",
  "Distance",
  "Recovery",
  "Test Set",
  "Cooldown",
  "Dryland",
] as const

export type SetTag = (typeof DEFAULT_PRACTICE_TAGS)[number]

// Normalize a raw tag to Title Case and collapse whitespace so that
// "sprint" / "SPRINT" / " Sprint " all archive under the same "Sprint".
export function normalizeTag(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ")
  if (!cleaned) return ""
  const canonical = DEFAULT_PRACTICE_TAGS.find((t) => t.toLowerCase() === cleaned.toLowerCase())
  if (canonical) return canonical
  return cleaned
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of raw) {
    const norm = normalizeTag(String(t ?? ""))
    if (norm && !seen.has(norm.toLowerCase())) {
      seen.add(norm.toLowerCase())
      out.push(norm)
    }
  }
  return out
}
