import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizePreferredName } from "@/lib/athlete/athlete-match"
import { isStaffRole } from "@swimbuzz/shared"
import { Gender, Prisma } from "@prisma/client"
import {
  resolveSwimCloudProfilesUpdate,
  SwimCloudProfileError,
  withLegacySwimCloudId,
  type SwimCloudProfiles,
} from "@/lib/swim/swimcloud-profiles"
import { isCuid, uniqueAthleteSlug } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { redactAthleteForViewer } from "@/lib/athlete/athlete-privacy"
import { loadRelaySplits } from "@/lib/meet/relay-splits"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: param } = await params
  const athlete = await prisma.athlete.findFirst({
    where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
    include: {
      user: { select: { name: true, email: true, image: true, staffTitle: true } },
      swims: {
        orderBy: { date: "desc" },
        include: {
          meetRef: { select: { id: true, slug: true, season: true, name: true } },
        },
      },
    },
  })
  if (!athlete) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Relay leg 2–4 splits: extra PB rows + history entries, never counted as swims.
  const relaySplits = (await loadRelaySplits({ athleteIds: [athlete.id] })).map((split) => ({
    id: `relay-split:${split.id}`,
    event: split.event,
    course: split.course,
    timeMs: split.timeMs,
    date: split.date,
    relayEvent: split.relayEvent,
    leg: split.leg,
    meet: split.meetName,
    meetRef: split.meet ? { id: split.meet.id, slug: split.meet.slug, name: split.meet.name } : null,
  }))

  return NextResponse.json({
    ...withLegacySwimCloudId(redactAthleteForViewer(athlete, session)),
    relaySplits,
  })
}

/** resolveSwimCloudProfilesUpdate, with a bad or taken ID turned into the error response. */
async function resolveSwimCloudOrResponse(
  ...args: Parameters<typeof resolveSwimCloudProfilesUpdate>
): Promise<{ ok: true; profiles: SwimCloudProfiles } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, profiles: await resolveSwimCloudProfilesUpdate(...args) }
  } catch (err) {
    if (!(err instanceof SwimCloudProfileError)) throw err
    return { ok: false, response: NextResponse.json({ error: err.message }, { status: err.status }) }
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Athletes can't edit their own profile; coaches do.
  if (!isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  const athlete = await prisma.athlete.findUnique({ where: { id } })
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const data: Prisma.AthleteUpdateInput = {}

  if (typeof body.firstName === "string") {
    const firstName = body.firstName.trim()
    if (!firstName) {
      return NextResponse.json({ error: "First name cannot be empty" }, { status: 400 })
    }
    data.firstName = firstName
  }

  if (typeof body.lastName === "string") {
    const lastName = body.lastName.trim()
    if (!lastName) {
      return NextResponse.json({ error: "Last name cannot be empty" }, { status: 400 })
    }
    data.lastName = lastName
  }

  const nextFirstName = typeof data.firstName === "string" ? data.firstName : athlete.firstName
  const nextLastName = typeof data.lastName === "string" ? data.lastName : athlete.lastName
  if (nextFirstName !== athlete.firstName || nextLastName !== athlete.lastName) {
    data.slug = await uniqueAthleteSlug(nextFirstName, nextLastName, id)
  }

  if (body.gender === "M" || body.gender === "F") {
    data.gender = body.gender === "F" ? Gender.F : Gender.M
  }

  if ("preferredName" in body) {
    data.preferredName = normalizePreferredName(body.preferredName)
  }

  // swimCloudIds replaces the list; legacy swimCloudId (older mobile builds) sets the main one.
  if ("swimCloudIds" in body || "swimCloudId" in body) {
    const resolved = await resolveSwimCloudOrResponse(
      athlete,
      { swimCloudIds: body.swimCloudIds, swimCloudId: body.swimCloudId },
      id
    )
    if (!resolved.ok) return resolved.response
    Object.assign(data, resolved.profiles)
  }

  // Email + display name live on the linked User record.
  let email: string | null = null
  if (typeof body.email === "string") {
    email = body.email.trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 })
    }
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser && existingUser.id !== athlete.userId) {
      return NextResponse.json({ error: "Another user already has this email" }, { status: 409 })
    }
  }

  if (Object.keys(data).length === 0 && email === null) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.athlete.update({ where: { id }, data })

    const nameChanged = data.firstName !== undefined || data.lastName !== undefined
    if (email !== null || nameChanged) {
      await tx.user.update({
        where: { id: athlete.userId },
        data: {
          ...(email !== null ? { email } : {}),
          ...(nameChanged ? { name: `${result.firstName} ${result.lastName}` } : {})}})
    }

    return result
  })

  return NextResponse.json(withLegacySwimCloudId(updated))
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: { user: { select: { id: true, role: true, staffTitle: true } } }})
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.swim.deleteMany({ where: { athleteId: id } })
    await tx.athlete.delete({ where: { id } })
    // Remove the auto-provisioned athlete login (cascades sessions/accounts).
    // A Social Director is role ATHLETE too, but is still a staff account —
    // only delete a plain athlete with no staff title.
    if (athlete.user?.role === "ATHLETE" && athlete.user.staffTitle == null) {
      await tx.user.delete({ where: { id: athlete.user.id } })
    }
  })

  return NextResponse.json({ ok: true })
}
