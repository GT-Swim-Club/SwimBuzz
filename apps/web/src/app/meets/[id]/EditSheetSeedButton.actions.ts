"use server"

import { revalidatePath } from "next/cache"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  isValidSignupEntryTime,
  normalizeSignupEntryTime,
  resolveSignupEventOptions,
  updateManualIndividualSheetEntry,
  deleteManualIndividualSheetEntry } from "@/lib/meet/meet-signup"
import { isSheetSummary } from "@/lib/meet/meet-sheet-summary"
import { normalizeEventName } from "@/lib/swim/swim-parse"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"

export type EditSheetSeedInput = {
  athleteId: string
  event: string
  newEvent: string
  seedTime: string
}

/** Same logic as PATCH /api/meets/[id]/sheet-entry (manual individual branch). */
export async function editSheetSeed(meetId: string, input: EditSheetSeedInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }
  if (!input.athleteId || !input.event) {
    throw new Error("athleteId and event are required")
  }

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { course: true, eventOrder: true, entriesSheetSummary: true }})
  if (!meet) throw new Error("Meet not found")

  const eventOptions = resolveSignupEventOptions(meet.eventOrder)
  const nextEvent = input.newEvent || input.event
  const nextEventNorm = normalizeEventName(nextEvent)
  if (
    eventOptions.length > 0 &&
    !eventOptions.some((o) => normalizeEventName(o.event) === nextEventNorm)
  ) {
    throw new Error("Invalid event")
  }

  const seedTimeRaw = input.seedTime || "NT"
  const seedNormalized = normalizeSignupEntryTime(seedTimeRaw)
  if (!/^nt$/i.test(seedNormalized) && !isValidSignupEntryTime(seedNormalized)) {
    throw new Error("Enter a valid seed time (e.g. 58.32 or 1:02.15) or NT")
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: input.athleteId },
    select: { id: true, firstName: true, lastName: true, gender: true }})
  if (!athlete) throw new Error("Athlete not found")

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const { summary, found, conflict } = updateManualIndividualSheetEntry(existing, meet.course, {
    athleteId: input.athleteId,
    event: input.event,
    newEvent: nextEvent,
    seedTime: seedNormalized,
    athleteName: `${athlete.lastName}, ${athlete.firstName}`,
    gender: athlete.gender === "F" ? "F" : athlete.gender === "M" ? "M" : null,
    eventOptions})

  if (!found) {
    throw new Error("That sign-up roster entry was not found (imported sheet rows cannot be edited).")
  }
  if (conflict) {
    throw new Error("Athlete already has that event on the roster summary.")
  }

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue }})

  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}

/** Same logic as DELETE /api/meets/[id]/sheet-entry (manual individual branch). */
export async function deleteSheetSeed(meetId: string, athleteId: string, event: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }
  if (!athleteId || !event) {
    throw new Error("athleteId and event are required")
  }

  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { course: true, entriesSheetSummary: true }})
  if (!meet) throw new Error("Meet not found")

  const existing = isSheetSummary(meet.entriesSheetSummary) ? meet.entriesSheetSummary : null
  const { summary, found } = deleteManualIndividualSheetEntry(existing, meet.course, {
    athleteId,
    event})

  if (!found) {
    throw new Error("That sign-up roster entry was not found (imported sheet rows cannot be deleted).")
  }

  await prisma.meet.update({
    where: { id: meetId },
    data: { entriesSheetSummary: summary as Prisma.InputJsonValue }})

  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}
