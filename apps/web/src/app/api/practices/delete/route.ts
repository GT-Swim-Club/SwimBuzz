import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth/session"
import { BulkDeleteInputError, deletePracticesFor } from "@/lib/practice/practice-bulk-delete"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Bulk delete for the mobile Practices tab's select mode (web calls the same logic through
 * its server action). Body: { ids: string[] }. Returns { deletedIds, skipped }.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { ids?: unknown }
  try {
    const result = await deletePracticesFor(session, body.ids)
    if (result.deletedIds.length > 0) revalidatePath("/practices", "layout")
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BulkDeleteInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
