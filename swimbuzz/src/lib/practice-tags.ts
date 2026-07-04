// Canonical set-type tags. Coaches pick from these when building a practice so
// the set archive stays searchable/filterable over time. Free-form tags are
// still allowed, but these cover the common cases and drive the filter UI.
export const SET_TAGS = [
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

export type SetTag = (typeof SET_TAGS)[number]

// Normalize a raw tag to Title Case and collapse whitespace so that
// "sprint" / "SPRINT" / " Sprint " all archive under the same "Sprint".
export function normalizeTag(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ")
  if (!cleaned) return ""
  const canonical = SET_TAGS.find((t) => t.toLowerCase() === cleaned.toLowerCase())
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
