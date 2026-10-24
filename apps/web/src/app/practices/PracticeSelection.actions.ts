"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth/session"
import { removePractice } from "@/lib/recovery/recovery"
import { PracticeEditLockError, assertCanMutatePractice } from "@/lib/practice/practice-edit-lock"
import { loadPracticeAccess, practiceAccessError, practiceViewer } from "@/lib/practice/practice-access"

const MAX_PRACTICES = 100

export type DeletePracticesResult = {
  deletedIds: string[]
  /** Practices left in place — currently being edited by someone, or already gone. */
  skipped: { id: string; reason: string }[]
}

/** Bulk delete from the practices sidebar's select mode. Same per-practice logic as
 * deletePractice / DELETE /api/practices/[id]: practices the caller can't edit or that are
 * under an active edit lock are skipped; private ones are deleted permanently. */
export async function deletePractices(ids: string[]): Promise<DeletePracticesResult> {
  const session = await getSession()
  if (!session) throw new Error("Forbidden")
  const viewer = practiceViewer(session)

  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))]
  if (unique.length === 0) throw new Error("Select at least one practice")
  if (unique.length > MAX_PRACTICES) {
    throw new Error(`Delete at most ${MAX_PRACTICES} practices at a time`)
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

  if (deletedIds.length > 0) revalidatePath("/practices", "layout")
  return { deletedIds, skipped }
}
