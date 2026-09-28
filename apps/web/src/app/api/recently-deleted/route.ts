import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { listRecentlyDeleted, restoreDeleted, purgeDeletedNow } from "@/lib/recovery/recovery"

async function authorized() {
  const session = await getSession()
  return session && isStaffRole(session.user.role)
}
function parseBody(body: unknown) {
  if (!body || typeof body !== "object") return null
  const { kind, id } = body as { kind?: unknown; id?: unknown }
  if (!["practice", "meet"].includes(kind as string) || typeof id !== "string" || !id) return null
  return { kind: kind as "practice" | "meet", id }
}
export async function GET() {
  if (!await authorized()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json(await listRecentlyDeleted())
}
export async function POST(req: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = parseBody(await req.json().catch(() => null))
  if (!parsed) return NextResponse.json({ error: "Invalid recovery request" }, { status: 400 })
  if (!await restoreDeleted(parsed.kind, parsed.id)) {
    return NextResponse.json({ error: "This item was already restored or its recovery period has expired" }, { status: 409 })
  }
  revalidatePath("/", "layout")
  return NextResponse.json({ ok: true })
}
export async function DELETE(req: Request) {
  if (!await authorized()) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = parseBody(await req.json().catch(() => null))
  if (!parsed) return NextResponse.json({ error: "Invalid recovery request" }, { status: 400 })
  if (!await purgeDeletedNow(parsed.kind, parsed.id)) {
    return NextResponse.json({ error: "This item was already restored or permanently deleted" }, { status: 409 })
  }
  revalidatePath("/", "layout")
  return NextResponse.json({ ok: true })
}
