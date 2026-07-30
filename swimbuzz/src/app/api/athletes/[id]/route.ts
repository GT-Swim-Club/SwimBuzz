import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { normalizeNicknames } from "@/lib/athlete-match"
import { isStaffRole } from "@/lib/auth-roles"
import { Gender, Prisma } from "@prisma/client"
import {
  clearPendingFields,
  mergePendingProfileChanges,
  nicknamesEqual,
  parsePendingProfileChanges,
  type PendingProfileChanges,
} from "@/lib/pending-profile-changes"
import {
  dismissProfileChangeRequestNotifications,
  notifyAthleteOfProfileChangeDecision,
  resolveProfileChangeRequestNotifications,
  syncProfileChangeRequestNotifications,
} from "@/lib/notifications"
import { parseSwimCloudId, SWIMCLOUD_ID_ERROR } from "@/lib/swimcloud-id"

async function parseSwimCloudIdForSet(
  raw: unknown,
  athleteId: string
): Promise<{ ok: true; swimCloudId: number } | { ok: false; response: NextResponse }> {
  const swimCloudId = parseSwimCloudId(raw)
  if (swimCloudId == null) {
    return {
      ok: false,
      response: NextResponse.json({ error: SWIMCLOUD_ID_ERROR }, { status: 400 }),
    }
  }
  const existing = await prisma.athlete.findFirst({
    where: { swimCloudId, id: { not: athleteId } },
  })
  if (existing) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "An athlete with this SwimCloud ID already exists" },
        { status: 409 }
      ),
    }
  }
  return { ok: true, swimCloudId }
}

function pendingJson(
  pending: PendingProfileChanges | null
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return pending === null ? Prisma.DbNull : (pending as Prisma.InputJsonValue)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()

  const athlete = await prisma.athlete.findUnique({ where: { id } })
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const staff = isStaffRole(session.user.role)
  const isOwnAthlete = athlete.userId === session.user.id
  const existingPending = parsePendingProfileChanges(athlete.pendingProfileChanges)

  // Athletes may request SwimCloud ID / nickname changes (coach approval required).
  if (!staff) {
    if (!isOwnAthlete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (body.cancelPendingProfileChanges === true) {
      const updated = await prisma.athlete.update({
        where: { id },
        data: { pendingProfileChanges: Prisma.DbNull },
      })
      await dismissProfileChangeRequestNotifications(id)
      return NextResponse.json(updated)
    }

    const allowedKeys = new Set(["swimCloudId", "nicknames"])
    const extraKeys = Object.keys(body).filter((key) => !allowedKeys.has(key))
    if (extraKeys.length > 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const patch: PendingProfileChanges = {}

    if ("nicknames" in body) {
      const nextNicknames = normalizeNicknames(body.nicknames)
      if (nicknamesEqual(nextNicknames, athlete.nicknames)) {
        // Requesting current values clears any pending nicknames change.
        if (existingPending?.nicknames !== undefined) {
          const cleared = clearPendingFields(existingPending, { nicknames: true })
          const updated = await prisma.athlete.update({
            where: { id },
            data: { pendingProfileChanges: pendingJson(cleared) },
          })
          await syncProfileChangeRequestNotifications({
            athleteId: id,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            pending: cleared,
          })
          return NextResponse.json(updated)
        }
        return NextResponse.json(athlete)
      }
      patch.nicknames = nextNicknames
    }

    if ("swimCloudId" in body) {
      if (body.swimCloudId === null || body.swimCloudId === "") {
        return NextResponse.json(
          { error: "SwimCloud ID is required" },
          { status: 400 }
        )
      }
      const parsed = await parseSwimCloudIdForSet(body.swimCloudId, id)
      if (!parsed.ok) return parsed.response
      if (athlete.swimCloudId === parsed.swimCloudId) {
        if (existingPending?.swimCloudId !== undefined) {
          const cleared = clearPendingFields(existingPending, { swimCloudId: true })
          const updated = await prisma.athlete.update({
            where: { id },
            data: { pendingProfileChanges: pendingJson(cleared) },
          })
          await syncProfileChangeRequestNotifications({
            athleteId: id,
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            pending: cleared,
          })
          return NextResponse.json(updated)
        }
        return NextResponse.json(athlete)
      }
      patch.swimCloudId = parsed.swimCloudId
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    const pending = mergePendingProfileChanges(existingPending, patch)
    const updated = await prisma.athlete.update({
      where: { id },
      data: { pendingProfileChanges: pendingJson(pending) },
    })
    await syncProfileChangeRequestNotifications({
      athleteId: id,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      pending,
    })
    return NextResponse.json(updated)
  }

  // Staff: approve or reject pending self-service changes.
  if (body.approvePendingProfileChanges === true || body.rejectPendingProfileChanges === true) {
    if (!existingPending) {
      return NextResponse.json({ error: "No pending changes" }, { status: 400 })
    }

    if (body.rejectPendingProfileChanges === true) {
      const updated = await prisma.athlete.update({
        where: { id },
        data: { pendingProfileChanges: Prisma.DbNull },
      })
      await resolveProfileChangeRequestNotifications(id, false)
      await notifyAthleteOfProfileChangeDecision({
        userId: athlete.userId,
        approved: false,
        pending: existingPending,
      })
      return NextResponse.json(updated)
    }

    const data: Prisma.AthleteUpdateInput = {
      pendingProfileChanges: Prisma.DbNull,
    }

    if (existingPending.swimCloudId !== undefined) {
      const parsed = await parseSwimCloudIdForSet(existingPending.swimCloudId, id)
      if (!parsed.ok) return parsed.response
      data.swimCloudId = parsed.swimCloudId
    }
    if (existingPending.nicknames !== undefined) {
      data.nicknames = existingPending.nicknames
    }

    const updated = await prisma.athlete.update({ where: { id }, data })
    await resolveProfileChangeRequestNotifications(id, true)
    await notifyAthleteOfProfileChangeDecision({
      userId: athlete.userId,
      approved: true,
      pending: existingPending,
    })
    return NextResponse.json(updated)
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

  if (body.gender === "M" || body.gender === "F") {
    data.gender = body.gender === "F" ? Gender.F : Gender.M
  }

  let clearSwimCloudPending = false
  let clearNicknamesPending = false

  if ("nicknames" in body) {
    data.nicknames = normalizeNicknames(body.nicknames)
    clearNicknamesPending = true
  }

  if ("swimCloudId" in body) {
    if (body.swimCloudId === null || body.swimCloudId === "") {
      data.swimCloudId = null
    } else {
      const parsed = await parseSwimCloudIdForSet(body.swimCloudId, id)
      if (!parsed.ok) return parsed.response
      data.swimCloudId = parsed.swimCloudId
    }
    clearSwimCloudPending = true
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

  if (clearSwimCloudPending || clearNicknamesPending) {
    const nextPending = clearPendingFields(existingPending, {
      swimCloudId: clearSwimCloudPending,
      nicknames: clearNicknamesPending,
    })
    data.pendingProfileChanges = pendingJson(nextPending)
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
          ...(nameChanged ? { name: `${result.firstName} ${result.lastName}` } : {}),
        },
      })
    }

    return result
  })

  if (clearSwimCloudPending || clearNicknamesPending) {
    await syncProfileChangeRequestNotifications({
      athleteId: id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      pending: parsePendingProfileChanges(updated.pendingProfileChanges),
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: { user: { select: { id: true, role: true } } },
  })
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.swim.deleteMany({ where: { athleteId: id } })
    await tx.athlete.delete({ where: { id } })
    // Remove the auto-provisioned athlete login (cascades sessions/accounts).
    if (athlete.user?.role === "ATHLETE") {
      await tx.user.delete({ where: { id: athlete.user.id } })
    }
  })

  return NextResponse.json({ ok: true })
}
