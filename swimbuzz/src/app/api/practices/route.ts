import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { buildPracticeData, PracticeInputError } from "@/lib/practice-input"
import { Prisma } from "@prisma/client"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim()
  const tag = searchParams.get("tag")?.trim()

  const and: Prisma.PracticeWhereInput[] = []

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
    and.push({ sets: { some: { tags: { has: tag } } } })
  }

  const practices = await prisma.practice.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      sets: { select: { tags: true, distance: true } },
      _count: { select: { sets: true } },
    },
  })

  return NextResponse.json(practices)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  try {
    const data = buildPracticeData(body, { requireSets: true })
    const practice = await prisma.practice.create({
      data: {
        title: data.title,
        date: data.date,
        focus: data.focus,
        createdById: session.user.id,
        sets: {
          create: data.sets.map((s) => ({
            order: s.order,
            title: s.title,
            content: s.content,
            notes: s.notes,
            tags: s.tags,
            distance: s.distance,
          })),
        },
      },
    })
    return NextResponse.json(practice, { status: 201 })
  } catch (err) {
    if (err instanceof PracticeInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
