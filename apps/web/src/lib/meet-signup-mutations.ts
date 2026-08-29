import { prisma } from "@/lib/prisma"
import {
  isValidSignupEntryTime,
  isSignupEntryTimes,
  mergeSignupIndividualsIntoEntriesSummary,
  normalizeMeetSignupQuestions,
  normalizeSignupEntryTime,
  normalizeSignupEntryTimes,
  parseCustomQuestionAnswers,
  partitionSignupEvents,
  resolveSignupEventOptions,
  sortSignupEventsByOrder,
  signupWindowStatus,
  signupWithdrawStatus,
  type SignupEntryForSheetSync,
} from "@/lib/meet-signup"
import {
  isResultStatusesSummary,
  isSheetSummary,
  meetHasImportedResults,
} from "@/lib/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/relay-results"
import { isStaffRole } from "@/lib/auth-roles"
import { Prisma } from "@prisma/client"

/**
 * Shared business logic behind the meet signup mutation routes
 * (api/meets/[id]/signup*), used by both the route handlers (mobile) and the
 * co-located server actions (web) so the two never drift.
 */
export class SignupActionError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function resolveLinkedAthleteId(sessionUserId: string): Promise<string> {
  const linked = await prisma.athlete.findUnique({
    where: { userId: sessionUserId },
    select: { id: true }})
  if (linked) return linked.id
  throw new SignupActionError(
    "Your account is not linked to a roster athlete. Ask a coach to add you.",
    400
  )
}

export async function saveSignupEntry(
  meetId: string,
  sessionUserId: string,
  body: {
    events?: unknown
    entryTimes?: unknown
    notes?: unknown
    answers?: unknown
  }
) {
  const athleteId = await resolveLinkedAthleteId(sessionUserId)

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { eventOrder: true, signupForm: true }})
  if (!meet?.signupForm) {
    throw new SignupActionError("Sign-ups are not set up for this meet", 404)
  }

  const form = meet.signupForm
  const window = signupWindowStatus({ openAt: form.openAt, closeAt: form.closeAt })
  if (!window.open) {
    throw new SignupActionError(window.reason ?? "Sign-ups are closed", 403)
  }

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const eventOptionNames = new Set(eventOptions.map((e) => e.event))
  if (eventOptionNames.size === 0) {
    throw new SignupActionError(
      "This meet has no order of events yet. Import the meet packet first.",
      400
    )
  }

  const events = Array.isArray(body.events)
    ? body.events
        .filter((e: unknown): e is string => typeof e === "string")
        .map((e: string) => e.trim())
        .filter(Boolean)
    : []

  if (events.length === 0) {
    throw new SignupActionError("Select at least one event", 400)
  }
  const invalid = events.filter((e: string) => !eventOptionNames.has(e))
  if (invalid.length > 0) {
    throw new SignupActionError(`Invalid events: ${invalid.join(", ")}`, 400)
  }

  const orderedEvents = sortSignupEventsByOrder(events, eventOptions)
  const { individual, relay } = partitionSignupEvents(orderedEvents)
  if (form.minEvents != null && individual.length < form.minEvents) {
    throw new SignupActionError(
      `Select at least ${form.minEvents} individual event${form.minEvents === 1 ? "" : "s"}`,
      400
    )
  }
  if (form.maxEvents != null && individual.length > form.maxEvents) {
    throw new SignupActionError(
      `You can enter at most ${form.maxEvents} individual event${form.maxEvents === 1 ? "" : "s"}`,
      400
    )
  }
  if (form.maxRelayEvents != null && relay.length > form.maxRelayEvents) {
    throw new SignupActionError(
      `You can enter at most ${form.maxRelayEvents} relay event${form.maxRelayEvents === 1 ? "" : "s"}`,
      400
    )
  }

  const rawTimes = normalizeSignupEntryTimes(body.entryTimes)
  const entryTimes: Record<string, string> = {}
  for (const event of individual) {
    const time = rawTimes[event]?.trim() ?? ""
    if (!time) {
      throw new SignupActionError(`Enter a seed time for ${event}`, 400)
    }
    if (!isValidSignupEntryTime(time)) {
      throw new SignupActionError(
        `Invalid time for ${event}. Use NT, or formats like 58.32 or 1:02.45`,
        400
      )
    }
    entryTimes[event] = normalizeSignupEntryTime(time)
  }

  const questions = normalizeMeetSignupQuestions(form.customQuestions)
  const parsedAnswers = parseCustomQuestionAnswers(questions, body.answers)
  if (!parsedAnswers.ok) {
    throw new SignupActionError(parsedAnswers.error, 400)
  }
  const answers = parsedAnswers.answers

  const notes =
    form.askNotes && typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : ""

  const entry = await prisma.meetSignupEntry.upsert({
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

  return {
    id: entry.id,
    athleteId,
    events: entry.events,
    entryTimes: entry.entryTimes,
    notes: entry.notes,
    answers: entry.answers,
    updatedAt: entry.updatedAt.toISOString()}
}

export async function withdrawSignupEntry(
  meetId: string,
  session: { user: { id: string; role: string } },
  athleteIdParam: string
) {
  const form = await prisma.meetSignupForm.findUnique({ where: { meetId } })
  if (!form) throw new SignupActionError("Not found", 404)

  let athleteId: string
  if (athleteIdParam) {
    if (!isStaffRole(session.user.role)) {
      throw new SignupActionError("Not authorized to drop this sign-up", 403)
    }
    athleteId = athleteIdParam
  } else {
    athleteId = await resolveLinkedAthleteId(session.user.id)
    const window = signupWithdrawStatus({
      openAt: form.openAt,
      closeAt: form.closeAt,
      withdrawUntil: form.withdrawUntil})
    if (!window.allowed) {
      throw new SignupActionError(window.reason ?? "Withdrawals are closed", 403)
    }
  }

  const deleted = await prisma.meetSignupEntry.deleteMany({
    where: { formId: form.id, athleteId }})
  if (deleted.count === 0) {
    throw new SignupActionError("Sign-up not found", 404)
  }

  return { ok: true as const }
}

export async function syncSignupEntriesToRoster(
  meetId: string,
  session: { user: { id: string; role: string } }
) {
  if (!isStaffRole(session.user.role)) {
    throw new SignupActionError("Forbidden", 403)
  }

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
              athlete: {
                select: { firstName: true, lastName: true, gender: true }}}}}}}})

  if (!meet) throw new SignupActionError("Meet not found", 404)
  if (!meet.signupForm) throw new SignupActionError("Sign-up form not set up", 404)

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
    throw new SignupActionError(
      "Cannot add sign-up entries to the roster summary after results have been imported.",
      409
    )
  }

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  if (eventOptions.length === 0) {
    throw new SignupActionError(
      "Import a meet packet so the order of events is available.",
      400
    )
  }

  const signups: SignupEntryForSheetSync[] = meet.signupForm.entries.map((entry) => ({
    athleteId: entry.athleteId,
    athleteName: `${entry.athlete.lastName}, ${entry.athlete.firstName}`,
    gender: entry.athlete.gender,
    events: entry.events,
    entryTimes: isSignupEntryTimes(entry.entryTimes) ? entry.entryTimes : {}}))

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const { summary, synced } = mergeSignupIndividualsIntoEntriesSummary(
    existing,
    meet.course,
    signups,
    eventOptions
  )

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue }})

  return { synced, athletes: signups.length }
}
