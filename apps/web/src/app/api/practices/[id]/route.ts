import { NextResponse } from "next/server"
import { notifyPracticePublished } from "@/lib/notifications/notifications"
import { prisma } from "@/lib/prisma"
import { buildPracticeData, PracticeInputError, practiceSetSelect } from "@/lib/practice/practice-input"
import { isStaffRole } from "@/lib/auth/auth-roles"
import {
  PRACTICE_EDIT_LOCK_TOKEN_HEADER,
  PracticeEditLockError,
  assertCanMutatePractice } from "@/lib/practice/practice-edit-lock"
import { uniquePracticeSlug } from "@/lib/slug"
import { zonedDayKey } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { findUnmanagedPracticeTags } from "@/lib/practice/practice-tag-catalog"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: {
      sets: { orderBy: { order: "asc" }, select: practiceSetSelect },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { staffTitle: true } } },
      }}})
  if (!practice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!practice.published && !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    ...practice,
    comments: practice.comments.map(({ author, ...c }) => ({
      ...c,
      authorStaffTitle: author?.staffTitle ?? null,
    })),
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const lockToken = req.headers.get(PRACTICE_EDIT_LOCK_TOKEN_HEADER)?.trim() || null
  try {
    await assertCanMutatePractice(id, session.user.id, lockToken)
  } catch (err) {
    if (err instanceof PracticeEditLockError) {
      return NextResponse.json({ error: err.message, lock: err.lock }, { status: err.status })
    }
    throw err
  }

  const existing = await prisma.practice.findUnique({
    where: { id },
    include: { sets: { select: { id: true } } }})
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  try {
    const data = buildPracticeData(body, { requireSets: true })
    const unmanagedTags = await findUnmanagedPracticeTags(data.tags)
    if (unmanagedTags.length) {
      return NextResponse.json(
        { error: "Use tags managed from the Practices page: " + unmanagedTags.join(", ") },
        { status: 400 }
      )
    }
    const existingIds = new Set(existing.sets.map((s) => s.id))
    const keepIds = new Set(
      data.sets.map((s) => s.id).filter((sid): sid is string => !!sid && existingIds.has(sid))
    )

    // Diff sets so comments on untouched sets survive edits.
    const existingDayKey = existing.startsAt
      ? zonedDayKey(existing.startsAt, existing.timeZone)
      : null
    const dateChanged = existingDayKey !== zonedDayKey(data.startsAt, data.timeZone)

    const practice = await prisma.$transaction(async (tx) => {
      await tx.practiceSet.deleteMany({
        where: { practiceId: id, id: { notIn: [...keepIds] } }})

      for (const s of data.sets) {
        if (s.id && keepIds.has(s.id)) {
          await tx.practiceSet.update({
            where: { id: s.id },
            data: {
              order: s.order,
              startsNewRow: s.startsNewRow,
              title: s.title,
              content: s.content,
              distance: s.distance}})
        } else {
          await tx.practiceSet.create({
            data: {
              practiceId: id,
              order: s.order,
              startsNewRow: s.startsNewRow,
              title: s.title,
              content: s.content,
              distance: s.distance}})
        }
      }

      return tx.practice.update({
        where: { id },
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
            ? { slug: await uniquePracticeSlug(data.startsAt, data.timeZone, id) }
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

    return NextResponse.json(practice)
  } catch (err) {
    if (err instanceof PracticeInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const lockToken = req.headers.get(PRACTICE_EDIT_LOCK_TOKEN_HEADER)?.trim() || null
  try {
    await assertCanMutatePractice(id, session.user.id, lockToken)
  } catch (err) {
    if (err instanceof PracticeEditLockError) {
      return NextResponse.json({ error: err.message, lock: err.lock }, { status: err.status })
    }
    throw err
  }

  const existing = await prisma.practice.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.practice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
