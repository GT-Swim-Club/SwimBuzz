import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { relayEditConflict } from "@/lib/meet/relay-edit-lock"
import { RELAY_EDIT_LOCK_TOKEN_HEADER } from "@/lib/meet/relay-edit-lock-shared"
import { isStaffRole } from "@swimbuzz/shared"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { meetHasEnded } from "@/lib/meet/meet-ended"
import { randomUUID } from "node:crypto"
import {
  appendRelayDraftVersion,
  isRelayDraftFor,
  parseRelayDraftGender,
  parseRelayDraftSettings,
  parseRelayDraftTeams,
  relayDraftHistoryOf,
  relayDraftsOf,
  removeRelayDraft,
  upsertRelayDraft,
  withRelayDrafts,
} from "@/lib/meet/relay-drafts"
import { parsePrelimsFinalsChoice, saveRelayPrelimsFinalsChoice } from "@/lib/meet/relay-prelims-finals"

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
  const meet = await prisma.meet.findUnique({
    where: { id },
    select: { relayDrafts: true, startsAt: true, endsAt: true },
  })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Drafts are deleted once the meet ends; a builder left open mustn't save them back.
  if (meetHasEnded({ startsAt: meet.startsAt, endsAt: meet.endsAt })) {
    return NextResponse.json({ error: "This meet has ended" }, { status: 409 })
  }

  const body =(await req.json().catch(() => null)) as Record<string, unknown> | null
  const event = normalizeEventName(String(body?.event ?? ""))
  const gender = parseRelayDraftGender(body?.gender)
  if (!event || !gender) {
    return NextResponse.json({ error: "Event and gender are required" }, { status: 400 })
  }
  const lockConflict = await relayEditConflict(
    id,
    { event, gender },
    session.user.id,
    req.headers.get(RELAY_EDIT_LOCK_TOKEN_HEADER)
  )
  if (lockConflict) return NextResponse.json(lockConflict, { status: 409 })
  const parsed = parseRelayDraftTeams(body?.teams)
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { teams } = parsed
  // Finals' own lineup (meets with a finals session); absent when finals follows prelims.
  let finalsTeams: typeof teams | null = null
  if (body?.finalsTeams != null) {
    const finals = parseRelayDraftTeams(body.finalsTeams)
    if ("error" in finals) return NextResponse.json({ error: `Finals: ${finals.error}` }, { status: 400 })
    finalsTeams = finals.teams
  }

  const settings = parseRelayDraftSettings(body?.settings)
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true } })
  const savedBy = { id: session.user.id, name: user?.name ?? null }
  const savedAt = new Date().toISOString()
  const published = body?.published === true

  const drafts = upsertRelayDraft(relayDraftsOf(meet.relayDrafts), {
    gender,
    event,
    teams,
    ...(finalsTeams ? { finalsTeams } : {}),
    savedAt,
    savedBy,
    ...(body?.optimal === true ? { optimal: true } : {}),
    ...(settings ? { settings } : {}),
    ...(published ? { published: true } : {}),
  })
  // Every draft and publish is also a version the builder can load again (the last few per event).
  const history = appendRelayDraftVersion(relayDraftHistoryOf(meet.relayDrafts), {
    id: randomUUID(),
    gender,
    event,
    teams,
    ...(finalsTeams ? { finalsTeams } : {}),
    ...(settings ? { settings } : {}),
    ...(typeof body?.splitRounds === "boolean" ? { prelimsFinals: body.splitRounds } : {}),
    ...(published ? { published: true } : {}),
    savedAt,
    savedBy,
  })
  await prisma.meet.update({ where: { id }, data: { relayDrafts: withRelayDrafts(meet.relayDrafts, drafts, history) } })
  const prelimsFinals = parsePrelimsFinalsChoice(body)
  if (prelimsFinals != null) await saveRelayPrelimsFinalsChoice(id, event, gender, prelimsFinals, session.user.id)
  return NextResponse.json({ ok: true })
}

/**
 * Discard the draft for one relay event (e.g. after publishing it), or with `version` just that
 * earlier version from the event's history.
 */
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

  const lockConflict = await relayEditConflict(
    id,
    { event, gender },
    session.user.id,
    req.headers.get(RELAY_EDIT_LOCK_TOKEN_HEADER)
  )
  if (lockConflict) return NextResponse.json(lockConflict, { status: 409 })

  const versionId = searchParams.get("version")
  if (versionId) {
    const history = relayDraftHistoryOf(meet.relayDrafts)
    const next = history.filter((v) => v.id !== versionId)
    if (next.length === history.length) return NextResponse.json({ error: "Version not found" }, { status: 404 })
    await prisma.meet.update({
      where: { id },
      data: { relayDrafts: withRelayDrafts(meet.relayDrafts, relayDraftsOf(meet.relayDrafts), next) },
    })
    return NextResponse.json({ ok: true })
  }

  // The deleted draft's own version goes too (it's the same save); earlier versions stay loadable.
  const current = relayDraftsOf(meet.relayDrafts)
  const deleted = current.find((d) => isRelayDraftFor(d, gender, event))
  const drafts = removeRelayDraft(current, gender, event)
  const history = deleted
    ? relayDraftHistoryOf(meet.relayDrafts).filter(
        (v) => !(v.savedAt === deleted.savedAt && isRelayDraftFor(v, gender, event))
      )
    : undefined
  await prisma.meet.update({ where: { id }, data: { relayDrafts: withRelayDrafts(meet.relayDrafts, drafts, history) } })
  return NextResponse.json({ ok: true })
}
