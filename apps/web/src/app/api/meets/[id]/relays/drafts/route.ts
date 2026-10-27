import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import {
  parseRelayDraftGender,
  parseRelayDraftSettings,
  parseRelayDraftTeams,
  relayDraftsOf,
  removeRelayDraft,
  upsertRelayDraft,
} from "@/lib/meet/relay-drafts"

export const runtime = "nodejs"

/**
 * Save the relay builder lineup for one relay event as the meet's shared draft. Publishing saves
 * one too (`published: true`) so the lineup's settings outlive the publish.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const meet = await prisma.meet.findUnique({ where: { id }, select: { relayDrafts: true } })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const event = normalizeEventName(String(body?.event ?? ""))
  const gender = parseRelayDraftGender(body?.gender)
  if (!event || !gender) {
    return NextResponse.json({ error: "Event and gender are required" }, { status: 400 })
  }
  const parsed = parseRelayDraftTeams(body?.teams)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { teams } = parsed

  const settings = parseRelayDraftSettings(body?.settings)

  const drafts = upsertRelayDraft(relayDraftsOf(meet.relayDrafts), {
    gender,
    event,
    teams,
    savedAt: new Date().toISOString(),
    ...(body?.optimal === true ? { optimal: true } : {}),
    ...(settings ? { settings } : {}),
    ...(body?.published === true ? { published: true } : {}),
  })
  await prisma.meet.update({ where: { id }, data: { relayDrafts: { drafts } } })
  return NextResponse.json({ ok: true })
}

/** Discard the draft for one relay event (e.g. after publishing it). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const meet = await prisma.meet.findUnique({ where: { id }, select: { relayDrafts: true } })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const event = normalizeEventName(searchParams.get("event") ?? "")
  const gender = parseRelayDraftGender(searchParams.get("gender"))
  if (!event || !gender) {
    return NextResponse.json({ error: "Event and gender are required" }, { status: 400 })
  }

  const drafts = removeRelayDraft(relayDraftsOf(meet.relayDrafts), gender, event)
  await prisma.meet.update({ where: { id }, data: { relayDrafts: { drafts } } })
  return NextResponse.json({ ok: true })
}
