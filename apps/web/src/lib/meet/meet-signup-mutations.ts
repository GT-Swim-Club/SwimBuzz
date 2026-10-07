import { notifyMeetSignupDropped } from "@/lib/notifications/notifications"
import { prisma } from "@/lib/prisma"
import {
  isValidSignupEntryTime,
  isSignupAnswers,
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
  type MeetSignupEventOption,
  type SignupEntryForSheetSync,
} from "@/lib/meet/meet-signup"
import {
  isResultStatusesSummary,
  isSheetSummary,
  meetHasImportedResults,
} from "@/lib/meet/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/meet/relay-results"
import { isStaffRole } from "@swimbuzz/shared"
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

export type SignupEntryInput = {
  events?: unknown
  entryTimes?: unknown
  notes?: unknown
  answers?: unknown
}

type SignupFormRecordForValidation = {
  minEvents: number | null
  maxEvents: number | null
  maxRelayEvents: number | null
  askNotes: boolean
  customQuestions: unknown
}

type ValidatedSignupEntryData = {
  orderedEvents: string[]
  entryTimes: Record<string, string>
  answers: Record<string, string>
  notes: string
  warnings: string[]
}

/**
 * Shared validation behind the athlete self-service path (`strict: true`,
 * throws on the first violation) and the staff-on-behalf import path
 * (`strict: false`, drops/normalizes the offending value and records a
 * warning instead) — so the two can never drift apart.
 */
function validateSignupEntryData(
  form: SignupFormRecordForValidation,
  eventOptions: MeetSignupEventOption[],
  body: SignupEntryInput,
  opts: { strict: boolean }
): ValidatedSignupEntryData {
  const warnings: string[] = []
  const warnOrFail = (message: string) => {
    if (opts.strict) throw new SignupActionError(message, 400)
    warnings.push(message)
  }

  const eventOptionNames = new Set(eventOptions.map((e) => e.event))
  if (opts.strict && eventOptionNames.size === 0) {
    throw new SignupActionError(
      "This meet has no order of events yet. Import the meet packet first.",
      400
    )
  }

  const rawEvents = Array.isArray(body.events)
    ? body.events
        .filter((e: unknown): e is string => typeof e === "string")
        .map((e: string) => e.trim())
        .filter(Boolean)
    : []

  if (opts.strict && rawEvents.length === 0) {
    throw new SignupActionError("Select at least one event", 400)
  }

  const invalid = rawEvents.filter((e) => !eventOptionNames.has(e))
  if (invalid.length > 0) {
    warnOrFail(`Invalid events: ${invalid.join(", ")}`)
  }
  const events = rawEvents.filter((e) => eventOptionNames.has(e))

  const orderedEvents = sortSignupEventsByOrder(events, eventOptions)
  const { individual, relay } = partitionSignupEvents(orderedEvents)
  if (form.minEvents != null && individual.length < form.minEvents) {
    warnOrFail(`Select at least ${form.minEvents} individual event${form.minEvents === 1 ? "" : "s"}`)
  }
  if (form.maxEvents != null && individual.length > form.maxEvents) {
    warnOrFail(`You can enter at most ${form.maxEvents} individual event${form.maxEvents === 1 ? "" : "s"}`)
  }
  if (form.maxRelayEvents != null && relay.length > form.maxRelayEvents) {
    warnOrFail(`You can enter at most ${form.maxRelayEvents} relay event${form.maxRelayEvents === 1 ? "" : "s"}`)
  }

  const rawTimes = normalizeSignupEntryTimes(body.entryTimes)
  const entryTimes: Record<string, string> = {}
  for (const event of individual) {
    const time = rawTimes[event]?.trim() ?? ""
    if (!time) {
      if (opts.strict) throw new SignupActionError(`Enter a seed time for ${event}`, 400)
      entryTimes[event] = "NT"
      continue
    }
    if (!isValidSignupEntryTime(time)) {
      if (opts.strict) {
        throw new SignupActionError(
          `Invalid time for ${event}. Use NT, or formats like 58.32 or 1:02.45`,
          400
        )
      }
      entryTimes[event] = "NT"
      warnings.push(`Invalid seed time for ${event} — used NT`)
      continue
    }
    entryTimes[event] = normalizeSignupEntryTime(time)
  }

  const questions = normalizeMeetSignupQuestions(form.customQuestions)
  const parsedAnswers = parseCustomQuestionAnswers(questions, body.answers)
  let answers: Record<string, string>
  if (!parsedAnswers.ok) {
    if (opts.strict) throw new SignupActionError(parsedAnswers.error, 400)
    warnings.push(parsedAnswers.error)
    answers = isSignupAnswers(body.answers) ? body.answers : {}
  } else {
    answers = parsedAnswers.answers
  }

  const notes =
    form.askNotes && typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : ""

  return { orderedEvents, entryTimes, answers, notes, warnings }
}

export async function saveSignupEntry(
  meetId: string,
  sessionUserId: string,
  body: SignupEntryInput
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
  const validated = validateSignupEntryData(form, eventOptions, body, { strict: true })

  const entry = await prisma.meetSignupEntry.upsert({
    where: { formId_athleteId: { formId: form.id, athleteId } },
    create: {
      formId: form.id,
      athleteId,
      events: validated.orderedEvents,
      entryTimes: validated.entryTimes as Prisma.InputJsonValue,
      notes: validated.notes,
      answers: validated.answers as Prisma.InputJsonValue},
    update: {
      events: validated.orderedEvents,
      entryTimes: validated.entryTimes as Prisma.InputJsonValue,
      notes: validated.notes,
      answers: validated.answers as Prisma.InputJsonValue}})

  return {
    id: entry.id,
    athleteId,
    events: entry.events,
    entryTimes: entry.entryTimes,
    notes: entry.notes,
    answers: entry.answers,
    updatedAt: entry.updatedAt.toISOString()}
}

async function loadValidatedSignupEntryData(
  formId: string,
  data: SignupEntryInput
): Promise<{ formId: string; validated: ValidatedSignupEntryData }> {
  const form = await prisma.meetSignupForm.findUnique({
    where: { id: formId },
    select: {
      minEvents: true,
      maxEvents: true,
      maxRelayEvents: true,
      askNotes: true,
      customQuestions: true,
      meet: { select: { eventOrder: true } }}})
  if (!form) throw new SignupActionError("Sign-up form not found", 404)

  const eventOptions = resolveSignupEventOptions(form.meet.eventOrder)
  const validated = validateSignupEntryData(form, eventOptions, data, { strict: false })
  return { formId, validated }
}

/**
 * Staff-only: preview the warnings a sign-up import row would produce
 * without writing anything — used by the dry-run step of the Google Form
 * response import wizard.
 */
export async function previewSignupEntryForAthlete(
  formId: string,
  data: SignupEntryInput
): Promise<{ warnings: string[] }> {
  const { validated } = await loadValidatedSignupEntryData(formId, data)
  return { warnings: validated.warnings }
}

/**
 * Staff-only: upsert a sign-up entry for an explicit athlete. Skips the
 * open/close window and the session-athlete binding; import surfaces
 * min/max-event violations as warnings instead of rejecting the row.
 */
export async function upsertSignupEntryForAthlete(
  formId: string,
  athleteId: string,
  data: SignupEntryInput
): Promise<{ entry: { id: string; updatedAt: string }; warnings: string[] }> {
  const { validated } = await loadValidatedSignupEntryData(formId, data)

  const entry = await prisma.meetSignupEntry.upsert({
    where: { formId_athleteId: { formId, athleteId } },
    create: {
      formId,
      athleteId,
      events: validated.orderedEvents,
      entryTimes: validated.entryTimes as Prisma.InputJsonValue,
      notes: validated.notes,
      answers: validated.answers as Prisma.InputJsonValue},
    update: {
      events: validated.orderedEvents,
      entryTimes: validated.entryTimes as Prisma.InputJsonValue,
      notes: validated.notes,
      answers: validated.answers as Prisma.InputJsonValue}})

  return {
    entry: { id: entry.id, updatedAt: entry.updatedAt.toISOString() },
    warnings: validated.warnings}
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

  if (!athleteIdParam) {
    // Notification delivery must not turn a completed withdrawal into an error.
    await notifyMeetSignupDropped({ meetId, athleteId }).catch((error) => {
      console.error("[meet-drop] Could not notify meet directors", error)
    })
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
