"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeNicknames } from "@/lib/athlete-match"
import { isStaffRole } from "@/lib/auth-roles"
import {
  clearPendingFields,
  mergePendingProfileChanges,
  nicknamesEqual,
  parsePendingProfileChanges,
  type PendingProfileChanges } from "@/lib/pending-profile-changes"
import {
  dismissProfileChangeRequestNotifications,
  notifyAthleteOfProfileChangeDecision,
  resolveProfileChangeRequestNotifications,
  syncProfileChangeRequestNotifications } from "@/lib/notifications"
import { parseSwimCloudId, SWIMCLOUD_ID_ERROR } from "@/lib/swimcloud-id"
import { getSession } from "@/lib/session"

/** Shared with PATCH /api/athletes/[id] — same logic, kept in sync manually
 * since the route can't be refactored without risking the mobile-facing
 * contract. Split into one action per body shape the route branches on. */

function pendingJson(
  pending: PendingProfileChanges | null
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return pending === null ? Prisma.DbNull : (pending as Prisma.InputJsonValue)
}

async function checkSwimCloudIdAvailable(raw: unknown, athleteId: string): Promise<number> {
  const swimCloudId = parseSwimCloudId(raw)
  if (swimCloudId == null) throw new Error(SWIMCLOUD_ID_ERROR)
  const existing = await prisma.athlete.findFirst({
    where: { swimCloudId, id: { not: athleteId } }})
  if (existing) throw new Error("An athlete with this SwimCloud ID already exists")
  return swimCloudId
}

async function requireSelfOrForbidden(athleteId: string) {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new Error("Not found")
  const staff = isStaffRole(session.user.role)
  if (!staff && athlete.userId !== session.user.id) throw new Error("Forbidden")
  return { session, athlete, staff }
}

export async function cancelPendingProfileChanges(athleteId: string) {
  const { athlete, staff } = await requireSelfOrForbidden(athleteId)
  if (staff) throw new Error("Forbidden")

  await prisma.athlete.update({
    where: { id: athleteId },
    data: { pendingProfileChanges: Prisma.DbNull }})
  await dismissProfileChangeRequestNotifications(athleteId)
  revalidatePath("/athletes/[id]", "page")
  void athlete
}

/** Self-service or staff direct edit — the route decides based on session
 * role, so this mirrors both branches. */
export async function updateNicknames(athleteId: string, nicknames: string[]) {
  const { athlete, staff } = await requireSelfOrForbidden(athleteId)
  const existingPending = parsePendingProfileChanges(athlete.pendingProfileChanges)
  const nextNicknames = normalizeNicknames(nicknames)

  if (!staff) {
    if (nicknamesEqual(nextNicknames, athlete.nicknames)) {
      if (existingPending?.nicknames !== undefined) {
        const cleared = clearPendingFields(existingPending, { nicknames: true })
        await prisma.athlete.update({
          where: { id: athleteId },
          data: { pendingProfileChanges: pendingJson(cleared) }})
        await syncProfileChangeRequestNotifications({
          athleteId,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          pending: cleared})
      }
      revalidatePath("/athletes/[id]", "page")
      return
    }

    const pending = mergePendingProfileChanges(existingPending, { nicknames: nextNicknames })
    await prisma.athlete.update({
      where: { id: athleteId },
      data: { pendingProfileChanges: pendingJson(pending) }})
    await syncProfileChangeRequestNotifications({
      athleteId,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      pending})
    revalidatePath("/athletes/[id]", "page")
    return
  }

  const cleared = clearPendingFields(existingPending, { nicknames: true })
  await prisma.athlete.update({
    where: { id: athleteId },
    data: { nicknames: nextNicknames, pendingProfileChanges: pendingJson(cleared) }})
  await syncProfileChangeRequestNotifications({
    athleteId,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    pending: cleared})
  revalidatePath("/athletes/[id]", "page")
}

export async function updateSwimCloudId(athleteId: string, swimCloudId: unknown) {
  const { athlete, staff } = await requireSelfOrForbidden(athleteId)
  const existingPending = parsePendingProfileChanges(athlete.pendingProfileChanges)

  if (!staff) {
    if (swimCloudId === null || swimCloudId === "") {
      throw new Error("SwimCloud ID is required")
    }
    const parsed = await checkSwimCloudIdAvailable(swimCloudId, athleteId)
    if (athlete.swimCloudId === parsed) {
      if (existingPending?.swimCloudId !== undefined) {
        const cleared = clearPendingFields(existingPending, { swimCloudId: true })
        await prisma.athlete.update({
          where: { id: athleteId },
          data: { pendingProfileChanges: pendingJson(cleared) }})
        await syncProfileChangeRequestNotifications({
          athleteId,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          pending: cleared})
      }
      revalidatePath("/athletes/[id]", "page")
      return
    }

    const pending = mergePendingProfileChanges(existingPending, { swimCloudId: parsed })
    await prisma.athlete.update({
      where: { id: athleteId },
      data: { pendingProfileChanges: pendingJson(pending) }})
    await syncProfileChangeRequestNotifications({
      athleteId,
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      pending})
    revalidatePath("/athletes/[id]", "page")
    return
  }

  const nextSwimCloudId =
    swimCloudId === null || swimCloudId === "" ? null : await checkSwimCloudIdAvailable(swimCloudId, athleteId)
  const cleared = clearPendingFields(existingPending, { swimCloudId: true })
  await prisma.athlete.update({
    where: { id: athleteId },
    data: { swimCloudId: nextSwimCloudId, pendingProfileChanges: pendingJson(cleared) }})
  await syncProfileChangeRequestNotifications({
    athleteId,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    pending: cleared})
  revalidatePath("/athletes/[id]", "page")
}

export async function approvePendingProfileChanges(athleteId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new Error("Not found")
  const existingPending = parsePendingProfileChanges(athlete.pendingProfileChanges)
  if (!existingPending) throw new Error("No pending changes")

  const data: Prisma.AthleteUpdateInput = { pendingProfileChanges: Prisma.DbNull }
  if (existingPending.swimCloudId !== undefined) {
    data.swimCloudId = await checkSwimCloudIdAvailable(existingPending.swimCloudId, athleteId)
  }
  if (existingPending.nicknames !== undefined) {
    data.nicknames = existingPending.nicknames
  }

  await prisma.athlete.update({ where: { id: athleteId }, data })
  await resolveProfileChangeRequestNotifications(athleteId, true)
  await notifyAthleteOfProfileChangeDecision({
    userId: athlete.userId,
    approved: true,
    pending: existingPending})
  revalidatePath("/athletes/[id]", "page")
}

export async function rejectPendingProfileChanges(athleteId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new Error("Not found")
  const existingPending = parsePendingProfileChanges(athlete.pendingProfileChanges)
  if (!existingPending) throw new Error("No pending changes")

  await prisma.athlete.update({
    where: { id: athleteId },
    data: { pendingProfileChanges: Prisma.DbNull }})
  await resolveProfileChangeRequestNotifications(athleteId, false)
  await notifyAthleteOfProfileChangeDecision({
    userId: athlete.userId,
    approved: false,
    pending: existingPending})
  revalidatePath("/athletes/[id]", "page")
}
