"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeMeetSignupQuestions } from "@/lib/meet-signup"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@swimbuzz/shared"

function parseOptionalDate(value: unknown): Date | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return undefined
  return d
}

export type SaveMeetRoomConfigInput = {
  isNew: boolean
  instructions: string
  maxPreferences: number
  timeZone: string
  openAt: string | null
  closeAt: string | null
  customQuestions: unknown
}

/** Same logic as POST + PATCH /api/meets/[id]/rooms — kept in sync manually
 * since the route can't be refactored without risking the mobile-facing
 * contract. */
export async function saveMeetRoomConfig(meetId: string, input: SaveMeetRoomConfigInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { id: true, timeZone: true }})
  if (!meet) throw new Error("Not found")

  if (input.isNew) {
    await prisma.meetRoomForm.upsert({
      where: { meetId },
      create: { meetId, timeZone: meet.timeZone ?? DEFAULT_TIME_ZONE },
      update: {}})
  }

  const instructions = input.instructions.trim()

  if (!Number.isFinite(input.maxPreferences) || input.maxPreferences < 1 || input.maxPreferences > 10) {
    throw new Error("Max preferences must be between 1 and 10")
  }

  const openAt = parseOptionalDate(input.openAt)
  const closeAt = parseOptionalDate(input.closeAt)
  if (openAt === undefined && input.openAt !== undefined) throw new Error("Invalid open date")
  if (closeAt === undefined && input.closeAt !== undefined) throw new Error("Invalid close date")

  const customQuestions = normalizeMeetSignupQuestions(input.customQuestions)

  let timeZone: string | undefined
  if (typeof input.timeZone === "string" && input.timeZone) {
    if (!isValidTimeZone(input.timeZone)) throw new Error("Time zone is invalid")
    timeZone = input.timeZone
  }

  const form = await prisma.meetRoomForm.upsert({
    where: { meetId },
    create: {
      meetId,
      timeZone: timeZone ?? DEFAULT_TIME_ZONE,
      instructions,
      maxPreferences: input.maxPreferences,
      openAt: openAt ?? null,
      closeAt: closeAt ?? null,
      customQuestions: customQuestions as Prisma.InputJsonValue},
    update: {
      instructions,
      maxPreferences: input.maxPreferences,
      ...(timeZone !== undefined ? { timeZone } : {}),
      openAt: openAt ?? null,
      closeAt: closeAt ?? null,
      customQuestions: customQuestions as Prisma.InputJsonValue}})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/roommates", "page")
  return {
    id: form.id,
    instructions: form.instructions,
    maxPreferences: form.maxPreferences,
    openAt: form.openAt?.toISOString() ?? null,
    closeAt: form.closeAt?.toISOString() ?? null,
    assignmentsPublishedAt: form.assignmentsPublishedAt?.toISOString() ?? null,
    customQuestions: normalizeMeetSignupQuestions(form.customQuestions),
    timeZone: form.timeZone}
}
