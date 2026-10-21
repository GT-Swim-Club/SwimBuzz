import { isRelayLeadoffSwimTag } from "@/lib/meet/relay-results"
import { meetPath, meetSwimPath } from "@/lib/slug"
import type { SwimDayRange } from "@/lib/swim/swim-dedup"
import { displaySwimTags } from "@/lib/swim/swim-tags"
import { formatTime } from "@/lib/utils"

/** One swim on the athlete profile, serialized for the client. */
export type AthleteSwim = {
  id: string
  event: string
  course: string
  timeMs: number
  tags: string
  meet: string
  meetId: string | null
  meetSlug: string | null
  meetIconUrl: string | null
  /** Days the linked meet spans, in its own time zone; null for unlinked swims. */
  meetDays: SwimDayRange | null
  /** ISO instant. */
  date: string
  source: string
  /** Set on a relay split (leg 2–4 of a relay): History-only, never a PB, chart or event page. */
  relaySplit?: { relayEvent: string; leg: number }
}

export function swimKey(swim: { event: string; course: string }): string {
  return `${swim.event}|${swim.course}`
}

/** Oldest first; on the same day the slower swim first, so a prelims → finals drop reads as a PB. */
export function compareSwimsChronologically(a: AthleteSwim, b: AthleteSwim): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return b.timeMs - a.timeMs
}

/** Newest first; on the same day the faster swim first. */
export function compareSwimsNewestFirst(a: AthleteSwim, b: AthleteSwim): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.timeMs - b.timeMs
}

export type SwimMarks = {
  /** The current best swim per event + course. */
  currentPb: Set<string>
  /** Swims that were a PB when they were swum (includes the current PBs). */
  pbAtTime: Set<string>
  /** Time vs. the best time before this swim (negative = faster); null for an event's first swim. */
  improvement: Map<string, number | null>
}

export function computeSwimMarks(swims: AthleteSwim[]): SwimMarks {
  const byKey = new Map<string, AthleteSwim[]>()
  for (const swim of swims) {
    const key = swimKey(swim)
    const list = byKey.get(key)
    if (list) list.push(swim)
    else byKey.set(key, [swim])
  }

  const currentPb = new Set<string>()
  const pbAtTime = new Set<string>()
  const improvement = new Map<string, number | null>()

  for (const list of byKey.values()) {
    let best: AthleteSwim | null = null
    for (const swim of [...list].sort(compareSwimsChronologically)) {
      if (!best) {
        improvement.set(swim.id, null)
        pbAtTime.add(swim.id)
        best = swim
        continue
      }
      improvement.set(swim.id, swim.timeMs - best.timeMs)
      if (swim.timeMs < best.timeMs) {
        pbAtTime.add(swim.id)
        best = swim
      }
    }
    if (best) currentPb.add(best.id)
  }

  return { currentPb, pbAtTime, improvement }
}

/** SwimCloud provenance flags, which ride alongside the round letters. */
const SWIM_FLAG_LABELS: Record<string, string> = { X: "Extracted", U: "User inputted" }

/** Provenance flags on the swim ("Extracted", "User inputted"), joined for display. */
export function swimFlagLabel(tags: string): string {
  const letters = displaySwimTags(tags)
  return Object.entries(SWIM_FLAG_LABELS)
    .filter(([letter]) => letters.includes(letter))
    .map(([, label]) => label)
    .join(" · ")
}

/** Round plus provenance flags shown beside the event in History, when the swim's tags say. */
export function swimRoundLabel(tags: string): string {
  // SwimCloud combines flags ("XR"), so look for the letter rather than an exact "R".
  const letters = displaySwimTags(tags)
  const round = isRelayLeadoffSwimTag(tags) || letters.includes("R")
    ? "Relay lead-off"
    : letters.includes("S")
      ? "Swim-off"
      : letters.includes("P")
        ? "Prelims"
        : letters.includes("F")
          ? "Finals"
          : [...letters].filter((c) => !(c in SWIM_FLAG_LABELS)).join("")
  return [round, swimFlagLabel(tags)].filter(Boolean).join(" · ")
}

/** History label for a relay split row. */
export const RELAY_SPLIT_LABEL = "Relay split"

/** Only hand-logged swims can be deleted (relay lead-offs come from relay results). */
export function isDeletableSwim(swim: AthleteSwim): boolean {
  return swim.source === "manual" && !isRelayLeadoffSwimTag(swim.tags)
}

/** Link to the swim on its meet page (scrolls to it and opens its detail), or null for unlinked swims. */
export function swimMeetHref(swim: AthleteSwim): string | null {
  // Relay splits aren't swims on the meet page; link the meet itself.
  if (swim.relaySplit) return swim.meetSlug ? meetPath(swim.meetSlug) : swim.meetId ? `/meets/${swim.meetId}` : null
  if (swim.meetSlug) return meetSwimPath(swim.meetSlug, swim.id)
  if (swim.meetId) return `/meets/${swim.meetId}#swim-${swim.id}`
  return null
}

/** "100 Free" → "100-free", for the `?event=` URL param. */
export function eventToParam(event: string): string {
  return event.trim().toLowerCase().replace(/\s+/g, "-")
}

export type MeetGroup = {
  key: string
  meet: string
  href: string | null
  iconUrl: string | null
  /** ISO instants of the group's first and last swim. */
  start: string
  end: string
  swims: AthleteSwim[]
}

/**
 * A linked swim from the meet an unlinked swim's day falls inside. SwimCloud
 * syncs carry their own meet name and no link, but a swimmer is only at one
 * meet on a given day, so the day alone places them.
 */
function linkedSwimOnDay(swim: AthleteSwim, linked: AthleteSwim[]): AthleteSwim | undefined {
  const day = swim.date.slice(0, 10)
  return linked.find((s) => s.meetDays && s.meetDays.start <= day && day <= s.meetDays.end)
}

/** Group newest-first swims into consecutive meets; swims without a meet group by day. */
export function groupSwimsByMeet(swimsNewestFirst: AthleteSwim[]): MeetGroup[] {
  const linked = swimsNewestFirst.filter((s) => s.meetId)
  const groups: MeetGroup[] = []
  for (const swim of swimsNewestFirst) {
    // The group takes its name and link from a linked swim, never a SwimCloud copy.
    const anchor = swim.meetId ? swim : (linkedSwimOnDay(swim, linked) ?? swim)
    const key = anchor.meetId ?? (swim.meet ? `name:${swim.meet}` : `day:${swim.date.slice(0, 10)}`)
    const day = swim.date.slice(0, 10)
    let group: MeetGroup | undefined = groups[groups.length - 1]
    if (group?.key !== key) {
      // Same-day swims sort by time, so two meets on one day interleave; rejoin this meet's run.
      group = groups.find((g) => g.key === key && g.start.slice(0, 10) === day)
    }
    if (!group) {
      group = {
        key,
        meet: anchor.meet || "Logged manually",
        href: anchor.meetSlug ? meetPath(anchor.meetSlug) : anchor.meetId ? `/meets/${anchor.meetId}` : null,
        iconUrl: anchor.meetIconUrl,
        start: swim.date,
        end: swim.date,
        swims: [],
      }
      groups.push(group)
    }
    group.swims.push(swim)
    if (swim.date < group.start) group.start = swim.date
    if (swim.date > group.end) group.end = swim.date
  }
  return groups
}

const GROUP_CHROME_PX = 66
const ROW_PX = 47

/**
 * Pack whole meets into pages that fit `budgetPx` (never splitting a meet).
 * Returns [firstGroupIndex, lastGroupIndex] per page.
 */
export function paginateMeetGroups(groups: MeetGroup[], budgetPx: number): Array<[number, number]> {
  const pages: Array<[number, number]> = []
  let used = 0
  groups.forEach((group, i) => {
    const h = GROUP_CHROME_PX + group.swims.length * ROW_PX
    const current = pages[pages.length - 1]
    // Start a new page only when this meet would overflow AND the page is already mostly full.
    if (!current || (used + h > budgetPx && used >= budgetPx * 0.95)) {
      pages.push([i, i])
      used = h
    } else {
      current[1] = i
      used += h
    }
  })
  return pages
}

/** Page buttons: all pages when ≤ 3, else first, current and last with gaps between. */
export function pageButtons(page: number, total: number): Array<number | "gap"> {
  if (total <= 3) return Array.from({ length: total }, (_, i) => i + 1)
  const out: Array<number | "gap"> = [1]
  if (page > 2) out.push("gap")
  if (page !== 1 && page !== total) out.push(page)
  if (page < total - 1) out.push("gap")
  out.push(total)
  return out
}

/** Signed time delta, e.g. "-0.42" / "+1:02.10"; "–" when there's nothing to compare. */
export function formatImprovement(delta: number | null): string {
  if (delta == null) return "–"
  return delta < 0 ? `-${formatTimeDelta(-delta)}` : `+${formatTimeDelta(delta)}`
}

/** Like formatTime, without zero-padding sub-minute values: 290 → "0.29", 62100 → "1:02.10". */
export function formatTimeDelta(ms: number): string {
  return ms >= 60_000 ? formatTime(ms) : (ms / 1000).toFixed(2)
}
