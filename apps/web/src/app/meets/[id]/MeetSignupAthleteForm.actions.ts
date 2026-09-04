"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  isValidSignupEntryTime,
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTime,
  normalizeSignupEntryTimes,
  parseCustomQuestionAnswers,
  partitionSignupEvents,
  resolveSignupEventOptions,
  signupWindowStatus,
  signupWithdrawStatus,
  sortSignupEventsByOrder } from "@/lib/meet/meet-signup"
import { getSession } from "@/lib/auth/session"

/** Same logic as PUT/DELETE /api/meets/[id]/signup/entry (self-service path,
 * no athleteId query param) — kept in sync manually since the route can't be
 * refactored without risking the mobile-facing contract. */

async function resolveLinkedAthleteId(sessionUserId: string): Promise<string> {
  const linked = await prisma.athlete.findUnique({
    where: { userId: sessionUserId },
    select: { id: true }})
  if (!linked) {
    throw new Error("Your account is not linked to a roster athlete. Ask a coach to add you.")
  }
  return linked.id
}

export async function submitMeetSignup(
  meetId: string,
  input: {
    events: string[]
    entryTimes: Record<string, string>
    notes: string
    answers: Record<string, string>
  }
) {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")

  const athleteId = await resolveLinkedAthleteId(session.user.id)

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { eventOrder: true, signupForm: true }})
  if (!meet?.signupForm) throw new Error("Sign-ups are not set up for this meet")

  const form = meet.signupForm
  const window = signupWindowStatus({ openAt: form.openAt, closeAt: form.closeAt })
  if (!window.open) throw new Error(window.reason ?? "Sign-ups are closed")

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const eventOptionNames = new Set(eventOptions.map((e) => e.event))
  if (eventOptionNames.size === 0) {
    throw new Error("This meet has no order of events yet. Import the meet packet first.")
  }

  const events = Array.isArray(input.events)
    ? input.events.map((e) => e.trim()).filter(Boolean)
    : []
  if (events.length === 0) throw new Error("Select at least one event")
  const invalid = events.filter((e) => !eventOptionNames.has(e))
  if (invalid.length > 0) throw new Error(`Invalid events: ${invalid.join(", ")}`)

  const orderedEvents = sortSignupEventsByOrder(events, eventOptions)
  const { individual, relay } = partitionSignupEvents(orderedEvents)
  if (form.minEvents != null && individual.length < form.minEvents) {
    throw new Error(
      `Select at least ${form.minEvents} individual event${form.minEvents === 1 ? "" : "s"}`
    )
  }
  if (form.maxEvents != null && individual.length > form.maxEvents) {
    throw new Error(
      `You can enter at most ${form.maxEvents} individual event${form.maxEvents === 1 ? "" : "s"}`
    )
  }
  if (form.maxRelayEvents != null && relay.length > form.maxRelayEvents) {
    throw new Error(
      `You can enter at most ${form.maxRelayEvents} relay event${form.maxRelayEvents === 1 ? "" : "s"}`
    )
  }

  const rawTimes = normalizeSignupEntryTimes(input.entryTimes)
  const entryTimes: Record<string, string> = {}
  for (const event of individual) {
    const time = rawTimes[event]?.trim() ?? ""
    if (!time) throw new Error(`Enter a seed time for ${event}`)
    if (!isValidSignupEntryTime(time)) {
      throw new Error(`Invalid time for ${event}. Use NT, or formats like 58.32 or 1:02.45`)
    }
    entryTimes[event] = normalizeSignupEntryTime(time)
  }

  const questions = normalizeMeetSignupQuestions(form.customQuestions)
  const parsedAnswers = parseCustomQuestionAnswers(questions, input.answers)
  if (!parsedAnswers.ok) throw new Error(parsedAnswers.error)
  const answers = parsedAnswers.answers

  const notes =
    form.askNotes && typeof input.notes === "string" ? input.notes.trim().slice(0, 2000) : ""

  await prisma.meetSignupEntry.upsert({
    where: { formId_athleteId: { formId: form.id, athleteId } },
    create: {
      formId: form.id,
      athleteId,
      events: orderedEvents,
      entryTimes: entryTimes as Prisma.InputJsonValue,
      notes,
      answers: answers as Prisma.InputJsonValue},
    update: {
      events: orderedEvents,
      entryTimes: entryTimes as Prisma.InputJsonValue,
      notes,
      answers: answers as Prisma.InputJsonValue}})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/signup", "page")
  return { ok: true }
}

export async function withdrawMeetSignup(meetId: string) {
  const session = await getSession()
  if (!session) throw new Error("Unauthorized")

  const form = await prisma.meetSignupForm.findUnique({ where: { meetId } })
  if (!form) throw new Error("Not found")

  const athleteId = await resolveLinkedAthleteId(session.user.id)

  const window = signupWithdrawStatus({
    openAt: form.openAt,
    closeAt: form.closeAt,
    withdrawUntil: form.withdrawUntil})
  if (!window.allowed) throw new Error(window.reason ?? "Withdrawals are closed")

  const deleted = await prisma.meetSignupEntry.deleteMany({
    where: { formId: form.id, athleteId }})
  if (deleted.count === 0) throw new Error("Sign-up not found")

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/signup", "page")
  return { ok: true }
}
