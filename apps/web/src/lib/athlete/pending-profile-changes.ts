import { normalizePreferredName } from "@/lib/athlete/athlete-match"
import { parseSwimCloudId } from "@/lib/swim/swimcloud-id"

export type PendingProfileChanges = {
  swimCloudId?: number
  /** null requests clearing the preferred name. */
  preferredName?: string | null
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

  if ("preferredName" in obj) {
    if (obj.preferredName !== null && typeof obj.preferredName !== "string") return null
    pending.preferredName = normalizePreferredName(obj.preferredName)
  }

  if (pending.swimCloudId === undefined && pending.preferredName === undefined) {
    return null
  }
  return pending
}

export function mergePendingProfileChanges(
  existing: PendingProfileChanges | null,
  patch: PendingProfileChanges
): PendingProfileChanges | null {
  const next: PendingProfileChanges = { ...(existing ?? {}) }
  if (patch.swimCloudId !== undefined) next.swimCloudId = patch.swimCloudId
  if (patch.preferredName !== undefined) next.preferredName = patch.preferredName
  if (next.swimCloudId === undefined && next.preferredName === undefined) return null
  return next
}

export function clearPendingFields(
  existing: PendingProfileChanges | null,
  fields: { swimCloudId?: boolean; preferredName?: boolean }
): PendingProfileChanges | null {
  if (!existing) return null
  const next: PendingProfileChanges = { ...existing }
  if (fields.swimCloudId) delete next.swimCloudId
  if (fields.preferredName) delete next.preferredName
  if (next.swimCloudId === undefined && next.preferredName === undefined) return null
  return next
}
