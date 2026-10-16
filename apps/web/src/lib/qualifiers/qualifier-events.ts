import type { QualifierAthlete, QualifierRow } from "@/lib/qualifiers/nationals-qualifiers"
import { meetSwimPath } from "@/lib/slug"

// Client-safe helpers for the Nationals page (nationals-qualifiers.ts pulls in Prisma).

export type QualifierSwim = { athlete: QualifierAthlete; swim: QualifierRow }

export type QualifierEventGroup = {
  key: string
  gender: QualifierAthlete["gender"]
  event: string
  cut: string
  /** Fastest first. */
  swims: QualifierSwim[]
}

/** The qualifying swim's spot on its meet page, or null for swims without a meet. */
export function qualifierSwimHref(swim: QualifierRow): string | null {
  if (!swim.meetId) return null
  return swim.meetSlug ? meetSwimPath(swim.meetSlug, swim.id) : `/meets/${swim.meetId}#swim-${swim.id}`
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
        group = { key, gender: athlete.gender, event: swim.event, cut: swim.cut, swims: [] }
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
