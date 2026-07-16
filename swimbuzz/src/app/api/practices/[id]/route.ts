import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { notifyPracticePublished } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { buildPracticeData, PracticeInputError } from "@/lib/practice-input"
import { isStaffRole } from "@/lib/auth-roles"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: {
      sets: { orderBy: { order: "asc" } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!practice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!practice.published && !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(practice)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.practice.findUnique({
    where: { id },
    include: { sets: { select: { id: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  try {
    const data = buildPracticeData(body, { requireSets: true })
    const existingIds = new Set(existing.sets.map((s) => s.id))
    const keepIds = new Set(
      data.sets.map((s) => s.id).filter((sid): sid is string => !!sid && existingIds.has(sid))
    )

    // Diff sets so comments on untouched sets survive edits.
    const practice = await prisma.$transaction(async (tx) => {
      await tx.practiceSet.deleteMany({
        where: { practiceId: id, id: { notIn: [...keepIds] } },
      })

      for (const s of data.sets) {
        if (s.id && keepIds.has(s.id)) {
          await tx.practiceSet.update({
            where: { id: s.id },
            data: {
              order: s.order,
              title: s.title,
              content: s.content,
              notes: s.notes,
              tags: s.tags,
              distance: s.distance,
            },
          })
        } else {
          await tx.practiceSet.create({
            data: {
              practiceId: id,
              order: s.order,
              title: s.title,
              content: s.content,
              notes: s.notes,
              tags: s.tags,
              distance: s.distance,
            },
          })
        }
      }

      return tx.practice.update({
        where: { id },
        data: { title: data.title, date: data.date, focus: data.focus, published: data.published },
      })
    })

    if (!existing.published && practice.published) {
      await notifyPracticePublished({
        practiceId: practice.id,
        title: practice.title,
        date: practice.date,
        focus: practice.focus,
        excludeUserId: session.user.id,
      })
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
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.practice.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.practice.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
