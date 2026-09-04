import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"

/** Single-letter swim result flags (not pipe-encoded metadata). */
const DISPLAY_TAG_LETTERS = new Set(["P", "F", "R", "B", "L"])

/** User-facing tag text — one-letter flags only, not storage encodings like R|200 Free Relay|P. */
export function displaySwimTags(tags: string): string {
  const trimmed = tags.trim()
  if (!trimmed) return ""

  if (isRelayLeadoffSwimTag(trimmed)) return "R"

  const upper = trimmed.toUpperCase()
  if (/^[A-Z]+$/.test(upper) && [...upper].every((c) => DISPLAY_TAG_LETTERS.has(c))) {
    return upper
  }

  const fromParts = trimmed
    .split("|")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length === 1 && DISPLAY_TAG_LETTERS.has(part))

  if (fromParts.length > 0) {
    return [...new Set(fromParts)].join("")
  }

  return ""
}

/** Meet sheet — hide prelim/final-only markers (round UI covers those). */
export function displayMeetResultTags(tags: string): string | undefined {
  const displayed = displaySwimTags(tags)
  if (!displayed || /^[PF]+$/i.test(displayed)) return undefined
  return displayed
}

/** Athlete swim history. */
export function displaySwimHistoryTags(tags: string): string {
  const displayed = displaySwimTags(tags)
  if (/^[PF]+$/i.test(displayed)) return ""
  return displayed
}
