"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeMeetSignupQuestions, resolveSignupEventOptions } from "@/lib/meet-signup"
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

export type SaveMeetSignupConfigInput = {
  instructions: string
  minEvents: string | null
  maxEvents: string | null
  maxRelayEvents: string | null
  askNotes: boolean
  customQuestions: unknown
  timeZone: string
  openAt: string | null
  closeAt: string | null
  withdrawUntil: string | null
}

/** Same logic as PUT /api/meets/[id]/signup — kept in sync manually since the
 * route can't be refactored without risking the mobile-facing contract. */
export async function saveMeetSignupConfig(meetId: string, input: SaveMeetSignupConfigInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { id: true, eventOrder: true, timeZone: true }})
  if (!meet) throw new Error("Not found")

  if (resolveSignupEventOptions(meet.eventOrder).length === 0) {
    throw new Error("Must have an order of events to set up a sign-up form.")
  }

  const instructions = typeof input.instructions === "string" ? input.instructions.trim() : ""
  const askNotes = input.askNotes !== false

  let minEvents: number | null = null
  if (input.minEvents !== null && input.minEvents !== "") {
    const n = parseInt(String(input.minEvents), 10)
    if (!Number.isFinite(n) || n < 1) throw new Error("Min individual events must be a positive number")
    minEvents = n
  }

  let maxEvents: number | null = null
  if (input.maxEvents !== null && input.maxEvents !== "") {
    const n = parseInt(String(input.maxEvents), 10)
    if (!Number.isFinite(n) || n < 1) throw new Error("Max individual events must be a positive number")
    maxEvents = n
  }

  if (minEvents != null && maxEvents != null && minEvents > maxEvents) {
    throw new Error("Min individual events cannot be greater than max")
  }

  let maxRelayEvents: number | null = null
  if (input.maxRelayEvents !== null && input.maxRelayEvents !== "") {
    const n = parseInt(String(input.maxRelayEvents), 10)
    if (!Number.isFinite(n) || n < 1) throw new Error("Max relay events must be a positive number")
    maxRelayEvents = n
  }

  const openAt = parseOptionalDate(input.openAt)
  const closeAt = parseOptionalDate(input.closeAt)
  const withdrawUntil = parseOptionalDate(input.withdrawUntil)
  if (openAt === undefined && input.openAt !== undefined) throw new Error("Invalid open date")
  if (closeAt === undefined && input.closeAt !== undefined) throw new Error("Invalid close date")
  if (withdrawUntil === undefined && input.withdrawUntil !== undefined) {
    throw new Error("Invalid withdraw deadline")
  }
  if (closeAt != null && withdrawUntil != null && withdrawUntil < closeAt) {
    throw new Error("Withdraw deadline must be on or after the signup close time")
  }

  const customQuestions = normalizeMeetSignupQuestions(input.customQuestions)

  let timeZone: string | undefined
  if (typeof input.timeZone === "string" && input.timeZone) {
    if (!isValidTimeZone(input.timeZone)) throw new Error("Time zone is invalid")
    timeZone = input.timeZone
  }

  const data = {
    instructions,
    allowedEvents: [] as string[],
    minEvents,
    maxEvents,
    maxRelayEvents,
    askNotes,
    customQuestions: customQuestions as Prisma.InputJsonValue,
    ...(timeZone !== undefined ? { timeZone } : {}),
    ...(input.openAt !== undefined ? { openAt: openAt ?? null } : {}),
    ...(input.closeAt !== undefined ? { closeAt: closeAt ?? null } : {}),
    ...(input.withdrawUntil !== undefined ? { withdrawUntil: withdrawUntil ?? null } : {})}

  await prisma.meetSignupForm.upsert({
    where: { meetId },
    create: { meetId, timeZone: timeZone ?? meet.timeZone ?? DEFAULT_TIME_ZONE, ...data },
    update: data})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/signups", "page")
  return { ok: true }
}
