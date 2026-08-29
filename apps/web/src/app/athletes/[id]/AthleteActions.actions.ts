"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { normalizeNicknames } from "@/lib/athlete-match"
import { isStaffRole } from "@/lib/auth-roles"
import { Prisma } from "@prisma/client"
import {
  clearPendingFields,
  parsePendingProfileChanges } from "@/lib/pending-profile-changes"
import { syncProfileChangeRequestNotifications } from "@/lib/notifications"
import { parseSwimCloudId, SWIMCLOUD_ID_ERROR } from "@/lib/swimcloud-id"
import { uniqueAthleteSlug } from "@/lib/slug"
import { getSession } from "@/lib/session"

export type UpdateAthleteInput = {
  firstName?: string
  lastName?: string
  email?: string
  swimCloudId?: string | null
  nicknames?: string[]
}

async function requireStaff() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }
  return session
}

/** Staff-edit branch of PATCH /api/athletes/[id] — kept in sync manually
 * since the route can't be refactored without risking the mobile-facing
 * contract (self-service pending-changes branch and approve/reject actions
 * are untouched here since AthleteActions is staff-only UI). */
export async function updateAthlete(athleteId: string, input: UpdateAthleteInput) {
  await requireStaff()

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new Error("Not found")

  const existingPending = parsePendingProfileChanges(athlete.pendingProfileChanges)
  const data: Prisma.AthleteUpdateInput = {}

  if (typeof input.firstName === "string") {
    const firstName = input.firstName.trim()
    if (!firstName) throw new Error("First name cannot be empty")
    data.firstName = firstName
  }

  if (typeof input.lastName === "string") {
    const lastName = input.lastName.trim()
    if (!lastName) throw new Error("Last name cannot be empty")
    data.lastName = lastName
  }

  const nextFirstName = typeof data.firstName === "string" ? data.firstName : athlete.firstName
  const nextLastName = typeof data.lastName === "string" ? data.lastName : athlete.lastName
  if (nextFirstName !== athlete.firstName || nextLastName !== athlete.lastName) {
    data.slug = await uniqueAthleteSlug(nextFirstName, nextLastName, athleteId)
  }

  let clearSwimCloudPending = false
  let clearNicknamesPending = false

  if (input.nicknames !== undefined) {
    data.nicknames = normalizeNicknames(input.nicknames)
    clearNicknamesPending = true
  }

  if (input.swimCloudId !== undefined) {
    if (input.swimCloudId === null || input.swimCloudId === "") {
      data.swimCloudId = null
    } else {
      const swimCloudId = parseSwimCloudId(input.swimCloudId)
      if (swimCloudId == null) throw new Error(SWIMCLOUD_ID_ERROR)
      const existing = await prisma.athlete.findFirst({
        where: { swimCloudId, id: { not: athleteId } }})
      if (existing) throw new Error("An athlete with this SwimCloud ID already exists")
      data.swimCloudId = swimCloudId
    }
    clearSwimCloudPending = true
  }

  let email: string | null = null
  if (typeof input.email === "string") {
    email = input.email.trim().toLowerCase()
    if (!email) throw new Error("Email cannot be empty")
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser && existingUser.id !== athlete.userId) {
      throw new Error("Another user already has this email")
    }
  }

  if (clearSwimCloudPending || clearNicknamesPending) {
    const nextPending = clearPendingFields(existingPending, {
      swimCloudId: clearSwimCloudPending,
      nicknames: clearNicknamesPending})
    data.pendingProfileChanges = nextPending === null ? Prisma.DbNull : (nextPending as Prisma.InputJsonValue)
  }

  if (Object.keys(data).length === 0 && email === null) {
    throw new Error("No valid fields to update")
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.athlete.update({ where: { id: athleteId }, data })

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

  if (clearSwimCloudPending || clearNicknamesPending) {
    await syncProfileChangeRequestNotifications({
      athleteId,
      firstName: updated.firstName,
      lastName: updated.lastName,
      pending: parsePendingProfileChanges(updated.pendingProfileChanges)})
  }

  revalidatePath("/athletes/[id]", "page")
  return updated
}

/** Same logic as DELETE /api/athletes/[id]. */
export async function deleteAthlete(athleteId: string) {
  await requireStaff()

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    include: { user: { select: { id: true, role: true, staffTitle: true } } }})
  if (!athlete) throw new Error("Not found")

  await prisma.$transaction(async (tx) => {
    await tx.swim.deleteMany({ where: { athleteId } })
    await tx.athlete.delete({ where: { id: athleteId } })
    if (athlete.user?.role === "ATHLETE" && athlete.user.staffTitle == null) {
      await tx.user.delete({ where: { id: athlete.user.id } })
    }
  })

  revalidatePath("/athletes")
  return { ok: true }
}
