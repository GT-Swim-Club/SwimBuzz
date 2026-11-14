import type { getSession } from "@/lib/auth/session"
import { removePractice } from "@/lib/recovery/recovery"
import { PracticeEditLockError, assertCanMutatePractice } from "@/lib/practice/practice-edit-lock"
import { loadPracticeAccess, practiceAccessError, practiceViewer } from "@/lib/practice/practice-access"

const MAX_PRACTICES = 100

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>

export type DeletePracticesResult = {
  deletedIds: string[]
  /** Practices left in place — currently being edited by someone, or already gone. */
  skipped: { id: string; reason: string }[]
}

/** A bad request (no ids, too many) — callers report it as a 400, not a server error. */
export class BulkDeleteInputError extends Error {}

/**
 * Bulk delete for select mode (the web practices sidebar and the mobile Practices tab).
 * Same per-practice logic as DELETE /api/practices/[id]: practices the caller can't edit
 * or that are under an active edit lock are skipped; private ones are deleted permanently.
 */
export async function deletePracticesFor(session: Session, ids: unknown): Promise<DeletePracticesResult> {
  const viewer = practiceViewer(session)

  const unique = Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : []
  if (unique.length === 0) throw new BulkDeleteInputError("Select at least one practice")
  if (unique.length > MAX_PRACTICES) {
    throw new BulkDeleteInputError(`Delete at most ${MAX_PRACTICES} practices at a time`)
  }

  const deletedIds: string[] = []
  const skipped: DeletePracticesResult["skipped"] = []
  for (const id of unique) {
    const access = await loadPracticeAccess(id)
    const denied = practiceAccessError(access, viewer, "edit")
    if (denied) {
      skipped.push({ id, reason: denied.status === 404 ? "Not found" : "You can't delete this practice" })
      continue
    }
    try {
      await assertCanMutatePractice(id, session.user.id, null)
    } catch (err) {
      if (err instanceof PracticeEditLockError) {
        skipped.push({ id, reason: err.message })
        continue
      }
      throw err
    }
    await removePractice(id, access!)
    deletedIds.push(id)
  }

  return { deletedIds, skipped }
}
