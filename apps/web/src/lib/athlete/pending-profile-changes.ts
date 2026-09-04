import { normalizeNicknames } from "@/lib/athlete/athlete-match"
import { parseSwimCloudId } from "@/lib/swim/swimcloud-id"

export type PendingProfileChanges = {
  swimCloudId?: number
  nicknames?: string[]
}

export function parsePendingProfileChanges(
  raw: unknown
): PendingProfileChanges | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const pending: PendingProfileChanges = {}

  if ("swimCloudId" in obj) {
    const id = parseSwimCloudId(obj.swimCloudId)
    if (id == null) return null
    pending.swimCloudId = id
  }

  if ("nicknames" in obj) {
    if (!Array.isArray(obj.nicknames)) return null
    pending.nicknames = normalizeNicknames(obj.nicknames)
  }

  if (pending.swimCloudId === undefined && pending.nicknames === undefined) {
    return null
  }
  return pending
}

export function nicknamesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].map((n) => n.toLowerCase()).sort()
  const right = [...b].map((n) => n.toLowerCase()).sort()
  return left.every((n, i) => n === right[i])
}

export function mergePendingProfileChanges(
  existing: PendingProfileChanges | null,
  patch: PendingProfileChanges
): PendingProfileChanges | null {
  const next: PendingProfileChanges = { ...(existing ?? {}) }
  if (patch.swimCloudId !== undefined) next.swimCloudId = patch.swimCloudId
  if (patch.nicknames !== undefined) next.nicknames = patch.nicknames
  if (next.swimCloudId === undefined && next.nicknames === undefined) return null
  return next
}

export function clearPendingFields(
  existing: PendingProfileChanges | null,
  fields: { swimCloudId?: boolean; nicknames?: boolean }
): PendingProfileChanges | null {
  if (!existing) return null
  const next: PendingProfileChanges = { ...existing }
  if (fields.swimCloudId) delete next.swimCloudId
  if (fields.nicknames) delete next.nicknames
  if (next.swimCloudId === undefined && next.nicknames === undefined) return null
  return next
}
