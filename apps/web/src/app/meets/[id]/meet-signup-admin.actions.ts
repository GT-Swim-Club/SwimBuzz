"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  isSignupEntryTimes,
  mergeSignupIndividualsIntoEntriesSummary,
  resolveSignupEventOptions,
  type SignupEntryForSheetSync } from "@/lib/meet-signup"
import { isResultStatusesSummary, isSheetSummary, meetHasImportedResults } from "@/lib/meet-sheet-summary"
import { isRelayResultsSummary } from "@/lib/relay-results"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

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
