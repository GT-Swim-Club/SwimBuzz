import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  MAX_SWIMCLOUD_IDS,
  parseSwimCloudProfileList,
  SWIMCLOUD_ID_ERROR,
  SWIMCLOUD_IDS_LIMIT_ERROR,
} from "@/lib/swim/swimcloud-id"
import type { SwimCloudTime } from "@/lib/swim/swimcloud-import"

/**
 * An athlete's SwimCloud profiles, main first. SwimCloud sometimes splits one
 * swimmer across profiles, so an athlete can hold up to MAX_SWIMCLOUD_IDS. The
 * list never repeats an ID, and no ID belongs to two athletes.
 */
export type SwimCloudProfiles = { swimCloudIds: number[] }

export const SWIMCLOUD_ID_TAKEN_ERROR = "An athlete with this SwimCloud ID already exists"

export class SwimCloudProfileError extends Error {
  constructor(message: string, readonly status: 400 | 409) {
    super(message)
  }
}

/** Main ID for older mobile builds, which read `swimCloudId` off athlete responses. */
export function withLegacySwimCloudId<T extends SwimCloudProfiles>(
  athlete: T
): T & { swimCloudId: number | null } {
  return { ...athlete, swimCloudId: athlete.swimCloudIds[0] ?? null }
}

/** Athletes holding this ID. */
export function swimCloudIdWhere(swimCloudId: number): Prisma.AthleteWhereInput {
  return { swimCloudIds: { has: swimCloudId } }
}

/** Athletes holding at least one SwimCloud ID. */
export const hasSwimCloudIdWhere: Prisma.AthleteWhereInput = {
  swimCloudIds: { isEmpty: false },
}

/** Throws when another athlete already holds one of these IDs. */
export async function assertSwimCloudIdsAvailable(
  ids: number[],
  athleteId?: string
): Promise<void> {
  if (ids.length === 0) return
  const taken = await prisma.athlete.findFirst({
    where: {
      swimCloudIds: { hasSome: ids },
      ...(athleteId ? { id: { not: athleteId } } : {}),
    },
    select: { id: true },
  })
  if (taken) throw new SwimCloudProfileError(SWIMCLOUD_ID_TAKEN_ERROR, 409)
}

/** An array of IDs/links, or one string of them separated by commas or whitespace. */
function parseIdList(raw: unknown): number[] {
  if (raw == null || raw === "") return []
  const pieces = Array.isArray(raw) ? raw : [raw]
  const ids: number[] = []
  for (const piece of pieces) {
    if (piece == null || piece === "") continue
    const parsed = parseSwimCloudProfileList(String(piece))
    if (parsed.invalid.length > 0 || parsed.ids.length === 0) {
      throw new SwimCloudProfileError(SWIMCLOUD_ID_ERROR, 400)
    }
    for (const id of parsed.ids) if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length > MAX_SWIMCLOUD_IDS) {
    throw new SwimCloudProfileError(SWIMCLOUD_IDS_LIMIT_ERROR, 400)
  }
  return ids
}

/**
 * Resolve a coach edit of the SwimCloud profiles. `swimCloudIds` replaces the
 * whole list. Legacy `swimCloudId` (older mobile builds) replaces just the main
 * ID, or drops it when null/"". Omitted fields keep the stored list. Throws
 * SwimCloudProfileError on a bad, excess, or taken ID. Adding a profile also
 * clears the imported-meets list, so the next times sync reads every meet of it.
 */
export async function resolveSwimCloudProfilesUpdate(
  current: SwimCloudProfiles,
  input: { swimCloudIds?: unknown; swimCloudId?: unknown },
  athleteId?: string
): Promise<SwimCloudProfiles & { swimCloudSyncedMeetIds?: number[] }> {
  let swimCloudIds = current.swimCloudIds
  if (input.swimCloudIds !== undefined) {
    swimCloudIds = parseIdList(input.swimCloudIds)
  } else if (input.swimCloudId !== undefined) {
    const [main] = parseIdList(input.swimCloudId)
    const rest = current.swimCloudIds.slice(1).filter((id) => id !== main)
    swimCloudIds = main == null ? rest : [main, ...rest]
  }
  await assertSwimCloudIdsAvailable(swimCloudIds, athleteId)
  const added = swimCloudIds.some((id) => !current.swimCloudIds.includes(id))
  return added ? { swimCloudIds, swimCloudSyncedMeetIds: [] } : { swimCloudIds }
}

/**
 * Combine the times scraped from an athlete's profiles. A race listed on both
 * profiles is kept once, while repeats within one profile (prelim and final at
 * the same time) stay as separate swims.
 */
export function mergeProfileTimes(profiles: SwimCloudTime[][]): SwimCloudTime[] {
  if (profiles.length <= 1) return profiles[0] ?? []

  // Same fields as swimDedupKey; the meet name can be worded differently per profile.
  const key = (t: SwimCloudTime) =>
    [t.event, t.course, t.time, t.date ?? "", t.tags ?? ""].join("\0")
  const kept = new Map<string, number>()
  const merged: SwimCloudTime[] = []

  for (const times of profiles) {
    const seen = new Map<string, number>()
    for (const time of times) {
      const k = key(time)
      const count = (seen.get(k) ?? 0) + 1
      seen.set(k, count)
      if (count > (kept.get(k) ?? 0)) {
        kept.set(k, count)
        merged.push(time)
      }
    }
  }
  return merged
}
