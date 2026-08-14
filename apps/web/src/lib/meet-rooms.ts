import { formatDateTime } from "@/lib/utils"

export type RoomRosterAthlete = {
  id: string
  name: string
  gender: "M" | "F"
}

export type RoomPreferenceInput = {
  athleteId: string
  preferredAthleteIds: string[]
  excludedAthleteIds?: string[]
  notes?: string
}

export type SuggestedRoom = {
  label: string
  athleteIds: string[]
}

export type RoomSuggestionResult = {
  rooms: SuggestedRoom[]
  unassigned: string[]
}

export function formatRoomLabel(roomNumber: number): string {
  return String(roomNumber)
}

export function roomAthleteSlotCount(
  rooms: Array<{ athleteIds?: string[]; athletes?: unknown[] }>,
  opts?: { extraEmptySlot?: boolean }
): number {
  const max = rooms.reduce(
    (acc, room) => Math.max(acc, room.athleteIds?.length ?? room.athletes?.length ?? 0),
    0
  )
  const extra = opts?.extraEmptySlot ? 1 : 0
  return max + extra
}

export function roomWindowStatus(opts: {
  openAt: Date | null
  closeAt: Date | null
  now?: Date
}): { open: boolean; reason: string | null } {
  const now = opts.now ?? new Date()
  if (!opts.openAt) {
    return { open: false, reason: "Roommate preferences are not open yet." }
  }
  if (now < opts.openAt) {
    return { open: false, reason: `Roommate preferences open ${formatDateTime(opts.openAt)}.` }
  }
  if (opts.closeAt && now > opts.closeAt) {
    return { open: false, reason: `Roommate preferences closed ${formatDateTime(opts.closeAt)}.` }
  }
  return { open: true, reason: null }
}

export function meetHasEnded(opts: {
  startDate: Date
  endDate: Date | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)
  const lastActiveDate = new Date(opts.endDate ?? opts.startDate)
  lastActiveDate.setHours(0, 0, 0, 0)
  return lastActiveDate <= yesterday
}

export function validateRoomPreferences(opts: {
  preferredAthleteIds: string[]
  roster: RoomRosterAthlete[]
  selfId: string
  selfGender: "M" | "F"
  maxPreferences: number
  forbiddenIds?: Set<string>
}): { ok: true; ids: string[] } | { ok: false; error: string } {
  const { preferredAthleteIds, roster, selfId, selfGender, maxPreferences, forbiddenIds } = opts
  const rosterById = new Map(roster.map((a) => [a.id, a]))

  if (!Array.isArray(preferredAthleteIds)) {
    return { ok: false, error: "Invalid preference list" }
  }

  const deduped: string[] = []
  const seen = new Set<string>()
  for (const raw of preferredAthleteIds) {
    if (typeof raw !== "string") continue
    const id = raw.trim()
    if (!id || id === selfId || seen.has(id)) continue
    if (forbiddenIds?.has(id)) {
      return { ok: false, error: "An athlete cannot be both preferred and excluded" }
    }
    seen.add(id)
    deduped.push(id)
  }

  if (deduped.length > maxPreferences) {
    return {
      ok: false,
      error: `Select at most ${maxPreferences} roommate preference${maxPreferences === 1 ? "" : "s"}`,
    }
  }

  for (const id of deduped) {
    const athlete = rosterById.get(id)
    if (!athlete) {
      return { ok: false, error: "One or more selected athletes are not on this meet's roster" }
    }
    if (athlete.gender !== selfGender) {
      return { ok: false, error: "Roommate preferences must be the same gender" }
    }
  }

  return { ok: true, ids: deduped }
}

export function validateRoomExclusions(opts: {
  excludedAthleteIds: string[]
  roster: RoomRosterAthlete[]
  selfId: string
  selfGender: "M" | "F"
  maxExclusions: number
  forbiddenIds?: Set<string>
}): { ok: true; ids: string[] } | { ok: false; error: string } {
  const { excludedAthleteIds, roster, selfId, selfGender, maxExclusions, forbiddenIds } = opts
  const rosterById = new Map(roster.map((a) => [a.id, a]))

  if (!Array.isArray(excludedAthleteIds)) {
    return { ok: false, error: "Invalid exclusion list" }
  }

  const deduped: string[] = []
  const seen = new Set<string>()
  for (const raw of excludedAthleteIds) {
    if (typeof raw !== "string") continue
    const id = raw.trim()
    if (!id || id === selfId || seen.has(id)) continue
    if (forbiddenIds?.has(id)) {
      return { ok: false, error: "An athlete cannot be both preferred and excluded" }
    }
    seen.add(id)
    deduped.push(id)
  }

  if (deduped.length > maxExclusions) {
    return {
      ok: false,
      error: `Select at most ${maxExclusions} exclusion${maxExclusions === 1 ? "" : "s"}`,
    }
  }

  for (const id of deduped) {
    const athlete = rosterById.get(id)
    if (!athlete) {
      return { ok: false, error: "One or more selected athletes are not on this meet's roster" }
    }
    if (athlete.gender !== selfGender) {
      return { ok: false, error: "Roommate exclusions must be the same gender" }
    }
  }

  return { ok: true, ids: deduped }
}

function exclusionMap(preferences: RoomPreferenceInput[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const pref of preferences) {
    map.set(pref.athleteId, new Set(pref.excludedAthleteIds ?? []))
  }
  return map
}

export function cannotRoomTogether(
  a: string,
  b: string,
  exclusions: Map<string, Set<string>>
): boolean {
  return exclusions.get(a)?.has(b) === true || exclusions.get(b)?.has(a) === true
}

function roomCompatibleWithAthlete(
  roomAthleteIds: string[],
  athleteId: string,
  exclusions: Map<string, Set<string>>
): boolean {
  return roomAthleteIds.every((id) => !cannotRoomTogether(id, athleteId, exclusions))
}

export function validateRoomAssignmentsAgainstExclusions(
  rooms: Array<{ athleteIds: string[] }>,
  preferences: RoomPreferenceInput[]
): { ok: true } | { ok: false; error: string } {
  const exclusions = exclusionMap(preferences)

  for (const room of rooms) {
    const athleteIds = room.athleteIds.filter(Boolean)
    for (let i = 0; i < athleteIds.length; i++) {
      for (let j = i + 1; j < athleteIds.length; j++) {
        if (cannotRoomTogether(athleteIds[i], athleteIds[j], exclusions)) {
          return {
            ok: false,
            error: "A room assignment conflicts with an athlete's exclusion preference",
          }
        }
      }
    }
  }

  return { ok: true }
}

function preferenceMap(preferences: RoomPreferenceInput[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const pref of preferences) {
    map.set(pref.athleteId, new Set(pref.preferredAthleteIds))
  }
  return map
}

function isMutual(
  a: string,
  b: string,
  prefs: Map<string, Set<string>>
): boolean {
  return prefs.get(a)?.has(b) === true && prefs.get(b)?.has(a) === true
}

export function suggestRoomGroups(
  preferences: RoomPreferenceInput[],
  roster: RoomRosterAthlete[],
  opts?: { maxRoomSize?: number }
): RoomSuggestionResult {
  const maxRoomSize = opts?.maxRoomSize ?? 2
  const rosterById = new Map(roster.map((a) => [a.id, a]))
  const prefs = preferenceMap(preferences)
  const exclusions = exclusionMap(preferences)
  const assigned = new Set<string>()
  const rooms: SuggestedRoom[] = []
  let roomIndex = 1

  const mutualPairs: [string, string][] = []
  const seenPairs = new Set<string>()
  for (const pref of preferences) {
    const a = pref.athleteId
    const athleteA = rosterById.get(a)
    if (!athleteA) continue
    for (const b of pref.preferredAthleteIds) {
      if (a >= b) continue
      const athleteB = rosterById.get(b)
      if (!athleteB || athleteA.gender !== athleteB.gender) continue
      if (!isMutual(a, b, prefs)) continue
      if (cannotRoomTogether(a, b, exclusions)) continue
      const key = `${a}:${b}`
      if (seenPairs.has(key)) continue
      seenPairs.add(key)
      mutualPairs.push([a, b])
    }
  }

  mutualPairs.sort((pairA, pairB) => {
    const score = (pair: [string, string]) =>
      (prefs.get(pair[0])?.size ?? 0) + (prefs.get(pair[1])?.size ?? 0)
    return score(pairB) - score(pairA)
  })

  for (const [a, b] of mutualPairs) {
    if (assigned.has(a) || assigned.has(b)) continue
    rooms.push({ label: formatRoomLabel(roomIndex++), athleteIds: [a, b] })
    assigned.add(a)
    assigned.add(b)
  }

  for (const pref of preferences) {
    const athleteId = pref.athleteId
    if (assigned.has(athleteId)) continue
    const athlete = rosterById.get(athleteId)
    if (!athlete) continue

    for (const pickId of pref.preferredAthleteIds) {
      if (assigned.has(pickId)) {
        const targetRoom = rooms.find(
          (room) =>
            room.athleteIds.includes(pickId) &&
            room.athleteIds.length < maxRoomSize &&
            room.athleteIds.every((id) => rosterById.get(id)?.gender === athlete.gender) &&
            roomCompatibleWithAthlete(room.athleteIds, athleteId, exclusions)
        )
        if (targetRoom && !targetRoom.athleteIds.includes(athleteId)) {
          targetRoom.athleteIds.push(athleteId)
          assigned.add(athleteId)
          break
        }
      }
    }
  }

  const unassigned = roster.map((a) => a.id).filter((id) => !assigned.has(id))
  return { rooms, unassigned }
}

export function normalizeRoomNotes(notes: unknown): string {
  if (typeof notes !== "string") return ""
  return notes.trim().slice(0, 2000)
}
