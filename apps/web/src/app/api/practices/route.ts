import { NextResponse } from "next/server"
import { notifyPracticePublished } from "@/lib/notifications/notifications"
import { prisma } from "@/lib/prisma"
import { buildPracticeData, PracticeInputError, practiceSetSelect } from "@/lib/practice/practice-input"
import { Prisma } from "@prisma/client"
import { uniquePracticeSlug } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { findUnmanagedPracticeTags } from "@/lib/practice/practice-tag-catalog"
import {
  PracticeVisibilityError,
  assertPrivatePracticeQuota,
  parsePracticeScope,
  practiceListWhere,
  practiceViewer,
  resolveNewPracticeVisibility } from "@/lib/practice/practice-access"

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const tag = searchParams.get("tag")?.trim()
  const scope = parsePracticeScope(searchParams.get("scope"))

  const and: Prisma.PracticeWhereInput[] = [practiceListWhere(practiceViewer(session), scope)]

  if (q) {
    const contains = { contains: q, mode: "insensitive" as const }
    and.push({
      OR: [
        { title: contains },
        { focus: contains },
        { sets: { some: { OR: [{ title: contains }, { content: contains }] } } },
      ]})
  }

  if (tag) {
    and.push({ tags: { has: tag } })
  }

  const practices = await prisma.practice.findMany({
    where: { AND: and },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { sets: true } }}})

  const practiceIds = practices.map((p) => p.id)
  const distanceSums = practiceIds.length
    ? await prisma.practiceSet.groupBy({
        by: ["practiceId"],
        where: { practiceId: { in: practiceIds } },
        _sum: { distance: true }})
    : []
  const totalDistanceByPractice = new Map(
    distanceSums.map((row) => [row.practiceId, row._sum.distance ?? 0])
  )

  return NextResponse.json(
    practices.map((p) => ({
      ...p,
      totalDistance: totalDistanceByPractice.get(p.id) ?? 0})),
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" } }
  )
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const visibility = resolveNewPracticeVisibility(body?.visibility, practiceViewer(session))
  const isPrivate = visibility === "PRIVATE"
  try {
    const data = buildPracticeData(body, { requireSets: true, requireTimes: isPrivate })
    const unmanagedTags = await findUnmanagedPracticeTags(data.tags)
    if (unmanagedTags.length) {
      return NextResponse.json(
        { error: "Use tags managed from the Practices page: " + unmanagedTags.join(", ") },
        { status: 400 }
      )
    }
    // Private practices skip date slugs so they never bump the team practice's URL for that day.
    const slug = isPrivate ? null : await uniquePracticeSlug(data.startsAt, data.timeZone)
    const practice = await prisma.$transaction(async (tx) => {
      if (isPrivate) await assertPrivatePracticeQuota(tx, session.user.id)
      return tx.practice.create({
        data: {
          slug,
          title: data.title,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          timeZone: data.timeZone,
          location: data.location,
          course: data.course,
          focus: data.focus,
          tags: data.tags,
          published: isPrivate ? false : data.published,
          visibility,
          ownerId: isPrivate ? session.user.id : null,
          createdById: session.user.id,
          sets: {
            create: data.sets.map((s) => ({
              order: s.order,
              startsNewRow: s.startsNewRow,
              title: s.title,
              content: s.content,
              distance: s.distance}))}},
        include: { sets: { orderBy: { order: "asc" }, select: practiceSetSelect } },
      })
    })
    if (practice.published) {
      await notifyPracticePublished({
        practiceId: practice.id,
        title: practice.title,
        startsAt: practice.startsAt,
        timeZone: practice.timeZone,
        focus: practice.focus,
        excludeUserId: session.user.id})
    }
    return NextResponse.json(practice, { status: 201 })
  } catch (err) {
    if (err instanceof PracticeInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof PracticeVisibilityError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
