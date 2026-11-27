import type { QualifierAthlete, QualifierRow } from "@/lib/qualifiers/nationals-qualifiers"
import { meetSwimPath } from "@/lib/slug"

// Client-safe helpers for the Nationals page (nationals-qualifiers.ts pulls in Prisma).

export type QualifierSwim = { athlete: QualifierAthlete; swim: QualifierRow }

export type QualifierEventGroup = {
  key: string
  gender: QualifierAthlete["gender"]
  event: string
  /** The event's number at Nationals for this group's gender, if known. */
  eventNumber: number | null
  cut: string
  /** Fastest first. */
  swims: QualifierSwim[]
}

/** "Women 50 Free" when both genders are shown, else just the event. */
export function eventGroupTitle(group: Pick<QualifierEventGroup, "gender" | "event">, splitGender: boolean) {
  return splitGender ? `${group.gender === "F" ? "Women" : "Men"} ${group.event}` : group.event
}

export function qualifierCountLabel(count: number) {
  return `${count} qualifier${count === 1 ? "" : "s"}`
}

/** The qualifying swim's spot on its meet page, or null for swims without a meet. */
export function qualifierSwimHref(swim: QualifierRow): string | null {
  if (!swim.meetId) return null
  return swim.meetSlug ? meetSwimPath(swim.meetSlug, swim.id) : `/meets/${swim.meetId}#swim-${swim.id}`
}

/** How far under the cut a qualifying swim is, e.g. "−0.42" (a cut matched exactly is "0.00"). */
export function qualifierMarginLabel(swim: Pick<QualifierRow, "timeMs" | "cutMs">): string {
  const diff = Math.max(0, swim.cutMs - swim.timeMs)
  if (diff === 0) return "0.00"
  const seconds = diff / 1000
  if (seconds < 60) return `−${seconds.toFixed(2)}`
  const minutes = Math.floor(seconds / 60)
  return `−${minutes}:${(seconds % 60).toFixed(2).padStart(5, "0")}`
}

/**
 * Regroups qualifying swims by event (and gender, when both are shown), in
 * `eventRank` order with women first within an event. `includeSwim` filters
 * individual swims, e.g. by search.
 */
export function groupQualifiersByEvent(
  athletes: QualifierAthlete[],
  eventRank: Record<string, number>,
  { splitGender, includeSwim }: { splitGender: boolean; includeSwim: (swim: QualifierSwim) => boolean }
): QualifierEventGroup[] {
  const groups = new Map<string, QualifierEventGroup>()
  for (const athlete of athletes) {
    for (const swim of athlete.events) {
      if (!includeSwim({ athlete, swim })) continue
      const key = `${splitGender ? athlete.gender : ""}|${swim.event}`
      let group = groups.get(key)
      if (!group) {
        group = {
          key,
          gender: athlete.gender,
          event: swim.event,
          eventNumber: swim.eventNumber,
          cut: swim.cut,
          swims: [],
        }
        groups.set(key, group)
      }
      group.swims.push({ athlete, swim })
    }
  }
  for (const group of groups.values()) group.swims.sort((a, b) => a.swim.timeMs - b.swim.timeMs)
  return [...groups.values()].sort(
    (a, b) =>
      (eventRank[a.event] ?? Number.MAX_SAFE_INTEGER) - (eventRank[b.event] ?? Number.MAX_SAFE_INTEGER) ||
      (a.gender === b.gender ? 0 : a.gender === "F" ? -1 : 1)
  )
}

export type QualifierGenderFilter = "all" | "M" | "F"

export function parseQualifierGender(value: string | null | undefined): QualifierGenderFilter {
  return value === "M" || value === "F" ? value : "all"
}

/**
 * What the Nationals page shows for a gender filter and search: `base` (the gender's qualifiers,
 * which the search placeholder counts), the athletes a search matches (by name or event,
 * alphabetical from the server), and — grouped by event — the matching swims per event. Shared by
 * the page and its PDF export so both list the same swims.
 */
export function selectQualifierView(
  qualifiers: QualifierAthlete[],
  {
    gender,
    query,
    byEvent,
    eventRank,
  }: { gender: QualifierGenderFilter; query: string; byEvent: boolean; eventRank: Record<string, number> }
) {
  const base = gender === "all" ? qualifiers : qualifiers.filter((athlete) => athlete.gender === gender)
  const needle = query.trim().toLowerCase()
  const nameMatches = (athlete: QualifierAthlete) =>
    [athlete.firstName, athlete.lastName, athlete.preferredName ?? ""].some((name) =>
      name.toLowerCase().includes(needle)
    )
  const eventMatches = (event: string) => event.toLowerCase().includes(needle)
  const athletes = base.filter(
    (athlete) => !needle || nameMatches(athlete) || athlete.events.some((e) => eventMatches(e.event))
  )
  const eventGroups = byEvent
    ? groupQualifiersByEvent(base, eventRank, {
        splitGender: gender === "all",
        includeSwim: ({ athlete, swim }) => !needle || nameMatches(athlete) || eventMatches(swim.event),
      })
    : []
  return { base, athletes, eventGroups }
}
