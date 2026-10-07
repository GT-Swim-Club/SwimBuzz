"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  normalizeMeetSignupQuestions,
  resolveSignupEventOptions,
  isValidSignupEntryTime,
  normalizeSignupEntryTime,
  normalizeSignupEntryTimes,
  parseCustomQuestionAnswers,
  partitionSignupEvents,
  signupWindowStatus,
  signupWithdrawStatus,
  sortSignupEventsByOrder,
  isSignupEntryTimes,
  mergeSignupIndividualsIntoEntriesSummary,
  type SignupEntryForSheetSync,
} from "@/lib/meet/meet-signup"
import { getSession } from "@/lib/auth/session"
import { DEFAULT_TIME_ZONE, isValidTimeZone, isStaffRole } from "@swimbuzz/shared"
import {
  isResultStatusesSummary,
  isSheetSummary,
  meetHasImportedResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"

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

/** Shared staff-facing sign-up admin actions, used by both MeetSignupSection
 * and signups/MeetSignupManager. Same logic as POST
 * /api/meets/[id]/signup/sync-entries and DELETE
 * /api/meets/[id]/signup/entry?athleteId=... — kept in sync manually since
 * the routes can't be refactored without risking the mobile-facing
 * contract. */

async function requireStaff() {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")
}

export async function syncSignupsToRoster(meetId: string) {
  await requireStaff()

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      course: true,
      eventOrder: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      _count: { select: { swims: true } },
      signupForm: {
        select: {
          entries: {
            select: {
              athleteId: true,
              events: true,
              entryTimes: true,
              athlete: { select: { firstName: true, lastName: true, gender: true } }}}}}}})
  if (!meet) throw new Error("Meet not found")
  if (!meet.signupForm) throw new Error("Sign-up form not set up")

  if (
    meetHasImportedResults({
      swimCount: meet._count.swims,
      resultStatusEntries: isResultStatusesSummary(meet.resultStatusesSummary)
        ? meet.resultStatusesSummary.entries
        : null,
      relayResults: isRelayResultsSummary(meet.relayResultsSummary)
        ? meet.relayResultsSummary.entries
        : null})
  ) {
    throw new Error("Cannot add sign-up entries to the roster summary after results have been imported.")
  }

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  if (eventOptions.length === 0) {
    throw new Error("Import a meet packet so the order of events is available.")
  }

  const signups: SignupEntryForSheetSync[] = meet.signupForm.entries.map((entry) => ({
    athleteId: entry.athleteId,
    athleteName: `${entry.athlete.lastName}, ${entry.athlete.firstName}`,
    gender: entry.athlete.gender,
    events: entry.events,
    entryTimes: isSignupEntryTimes(entry.entryTimes) ? entry.entryTimes : {}}))

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const { summary } = mergeSignupIndividualsIntoEntriesSummary(
    existing,
    meet.course,
    signups,
    eventOptions
  )

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue }})

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/signups", "page")
  return { ok: true }
}

export async function withdrawAthleteSignup(meetId: string, athleteId: string) {
  await requireStaff()

  const form = await prisma.meetSignupForm.findUnique({ where: { meetId } })
  if (!form) throw new Error("Not found")

  const deleted = await prisma.meetSignupEntry.deleteMany({
    where: { formId: form.id, athleteId }})
  if (deleted.count === 0) throw new Error("Sign-up not found")

  revalidatePath("/meets/[id]", "page")
  revalidatePath("/meets/[id]/signups", "page")
  return { ok: true }
}
