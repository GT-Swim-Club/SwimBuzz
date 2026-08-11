import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { notifyPracticePublished } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { buildPracticeData, PracticeInputError } from "@/lib/practice-input"
import { isStaffRole } from "@/lib/auth-roles"
import { Prisma } from "@prisma/client"
import { uniquePracticeSlug } from "@/lib/slug"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
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
        { sets: { some: { OR: [{ title: contains }, { content: contains }, { notes: contains }] } } },
      ],
    })
  }

  if (tag) {
    and.push({ tags: { has: tag } })
  }

  const practices = await prisma.practice.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      sets: { select: { distance: true } },
      _count: { select: { sets: true } },
    },
  })

  return NextResponse.json(practices)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  try {
    const data = buildPracticeData(body, { requireSets: true })
    const practice = await prisma.practice.create({
      data: {
        slug: await uniquePracticeSlug(data.date),
        title: data.title,
        date: data.date,
        focus: data.focus,
        tags: data.tags,
        published: data.published,
        createdById: session.user.id,
        sets: {
          create: data.sets.map((s) => ({
            order: s.order,
            title: s.title,
            content: s.content,
            notes: s.notes,
            distance: s.distance,
          })),
        },
      },
    })
    if (practice.published) {
      await notifyPracticePublished({
        practiceId: practice.id,
        title: practice.title,
        date: practice.date,
        focus: practice.focus,
        excludeUserId: session.user.id,
      })
    }
    return NextResponse.json(practice, { status: 201 })
  } catch (err) {
    if (err instanceof PracticeInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
