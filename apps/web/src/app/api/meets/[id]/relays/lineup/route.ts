import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { RELAY_EDIT_LOCK_TOKEN_HEADER } from "@/lib/meet/relay-edit-lock-shared"
import { parseBuilderLineupInput, publishBuilderLineups } from "@/lib/meet/relay-lineup-publish"
import { parsePrelimsFinalsChoice, saveRelayPrelimsFinalsChoice } from "@/lib/meet/relay-prelims-finals"

export const runtime = "nodejs"

/**
 * The relay builder's publish (and a draft's unpublish) for one relay event: replaces every lineup
 * the builder published for it — prelims, finals or the one round-less lineup — in one write.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { id } = await params
  const body: unknown = await req.json().catch(() => null)
  const input = parseBuilderLineupInput(body)
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 })

  const result = await publishBuilderLineups(id, input, session.user.id, req.headers.get(RELAY_EDIT_LOCK_TOKEN_HEADER))
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.lock ? { lock: result.lock } : {}) },
      { status: result.status }
    )
  }
  // "Prelims & finals" turned on or off with this save (shared by Women's and Men's).
  const prelimsFinals = parsePrelimsFinalsChoice(body)
  if (prelimsFinals != null) {
    await saveRelayPrelimsFinalsChoice(id, input.event, input.gender, prelimsFinals, session.user.id)
  }
  return NextResponse.json({ ok: true })
}
