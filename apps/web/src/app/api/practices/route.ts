import { NextResponse } from "next/server"
import { notifyPracticePublished } from "@/lib/notifications/notifications"
import { prisma } from "@/lib/prisma"
import { buildPracticeData, PracticeInputError, practiceSetSelect } from "@/lib/practice/practice-input"
import { isStaffRole } from "@/lib/auth/auth-roles"
import { Prisma } from "@prisma/client"
import { uniquePracticeSlug } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { findUnmanagedPracticeTags } from "@/lib/practice/practice-tag-catalog"

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const tag = searchParams.get("tag")?.trim()

  const and: Prisma.PracticeWhereInput[] = []

  if (!isStaffRole(session.user.role)) {
    and.push({ published: true })
  }

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
    where: and.length ? { AND: and } : undefined,
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
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

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
    const practice = await prisma.practice.create({
      data: {
        slug: await uniquePracticeSlug(data.startsAt, data.timeZone),
        title: data.title,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        timeZone: data.timeZone,
        location: data.location,
        focus: data.focus,
        tags: data.tags,
        published: data.published,
        createdById: session.user.id,
        sets: {
          create: data.sets.map((s) => ({
            order: s.order,
            title: s.title,
            content: s.content,
            distance: s.distance}))}},
      include: { sets: { orderBy: { order: "asc" }, select: practiceSetSelect } },
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
    throw err
  }
}
