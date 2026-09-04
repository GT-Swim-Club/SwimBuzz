"use server"

import { revalidatePath } from "next/cache"
import { notifyPracticePublished } from "@/lib/notifications/notifications"
import { prisma } from "@/lib/prisma"
import { buildPracticeData, PracticeInputError, practiceSetSelect } from "@/lib/practice/practice-input"
import { isStaffRole } from "@/lib/auth/auth-roles"
import {
  PracticeEditLockError,
  assertCanMutatePractice,
  type PracticeEditLockInfo } from "@/lib/practice/practice-edit-lock"
import { uniquePracticeSlug } from "@/lib/slug"
import { zonedDayKey } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { findUnmanagedPracticeTags } from "@/lib/practice/practice-tag-catalog"
import type { PracticeFormState } from "../PracticeEditor"

export type PracticeMutationResult =
  | { ok: true }
  | { ok: false; error: string; lock?: PracticeEditLockInfo }

/** Same logic as PATCH /api/practices/[id] — kept in sync manually since the
 * route can't be refactored without risking the mobile-facing contract. */
export async function setPracticePublished(
  practiceId: string,
  form: PracticeFormState,
  published: boolean
): Promise<PracticeMutationResult> {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  try {
    await assertCanMutatePractice(practiceId, session.user.id, null)
  } catch (err) {
    if (err instanceof PracticeEditLockError) {
      return { ok: false, error: err.message, lock: err.lock }
    }
    throw err
  }

  const existing = await prisma.practice.findUnique({
    where: { id: practiceId },
    include: { sets: { select: { id: true } } }})
  if (!existing) return { ok: false, error: "Not found" }

  try {
    const data = buildPracticeData({ ...form, published }, { requireSets: true })
    const unmanagedTags = await findUnmanagedPracticeTags(data.tags)
    if (unmanagedTags.length) {
      return {
        ok: false,
        error: "Use tags managed from the Practices page: " + unmanagedTags.join(", ")}
    }
    const existingIds = new Set(existing.sets.map((s) => s.id))
    const keepIds = new Set(
      data.sets.map((s) => s.id).filter((sid): sid is string => !!sid && existingIds.has(sid))
    )

    const existingDayKey = existing.startsAt
      ? zonedDayKey(existing.startsAt, existing.timeZone)
      : null
    const dateChanged = existingDayKey !== zonedDayKey(data.startsAt, data.timeZone)

    const practice = await prisma.$transaction(async (tx) => {
      await tx.practiceSet.deleteMany({
        where: { practiceId, id: { notIn: [...keepIds] } }})

      for (const s of data.sets) {
        if (s.id && keepIds.has(s.id)) {
          await tx.practiceSet.update({
            where: { id: s.id },
            data: { order: s.order, title: s.title, content: s.content, distance: s.distance }})
        } else {
          await tx.practiceSet.create({
            data: {
              practiceId,
              order: s.order,
              title: s.title,
              content: s.content,
              distance: s.distance }})
        }
      }

      return tx.practice.update({
        where: { id: practiceId },
        data: {
          title: data.title,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          timeZone: data.timeZone,
          location: data.location,
          focus: data.focus,
          tags: data.tags,
          published: data.published,
          ...(dateChanged
            ? { slug: await uniquePracticeSlug(data.startsAt, data.timeZone, practiceId) }
            : {}),
        },
        include: { sets: { orderBy: { order: "asc" }, select: practiceSetSelect } },
      })
    })

    if (!existing.published && practice.published) {
      await notifyPracticePublished({
        practiceId: practice.id,
        title: practice.title,
        startsAt: practice.startsAt,
        timeZone: practice.timeZone,
        focus: practice.focus,
        excludeUserId: session.user.id})
    }

    revalidatePath("/practices/[id]", "page")
    revalidatePath("/practices", "page")
    return { ok: true }
  } catch (err) {
    if (err instanceof PracticeInputError) return { ok: false, error: err.message }
    throw err
  }
}

/** Same logic as DELETE /api/practices/[id]. */
export async function deletePractice(practiceId: string): Promise<PracticeMutationResult> {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  try {
    await assertCanMutatePractice(practiceId, session.user.id, null)
  } catch (err) {
    if (err instanceof PracticeEditLockError) {
      return { ok: false, error: err.message, lock: err.lock }
    }
    throw err
  }

  const existing = await prisma.practice.findUnique({ where: { id: practiceId } })
  if (!existing) return { ok: false, error: "Not found" }

  await prisma.practice.delete({ where: { id: practiceId } })
  revalidatePath("/practices", "page")
  return { ok: true }
}
