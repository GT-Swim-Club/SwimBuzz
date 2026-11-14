"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth/session"
import { deletePracticesFor, type DeletePracticesResult } from "@/lib/practice/practice-bulk-delete"

export type { DeletePracticesResult }

/** Bulk delete from the practices sidebar's select mode — see deletePracticesFor. */
export async function deletePractices(ids: string[]): Promise<DeletePracticesResult> {
  const session = await getSession()
  if (!session) throw new Error("Forbidden")

  const result = await deletePracticesFor(session, ids)
  if (result.deletedIds.length > 0) revalidatePath("/practices", "layout")
  return result
}
