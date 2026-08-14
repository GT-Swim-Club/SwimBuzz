import { NextResponse as ServerResponse } from "next/server"
import { getSession } from "@/lib/session"
import { prisma } from "@/lib/prisma"

const respond = (body: unknown, status = 200) => ServerResponse.json(body, { status })

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  void request
  const session = await getSession()
  if (!session || session.user.role !== "COACH") {
    return respond({ error: "Forbidden" }, 403)
  }

  const parameters = await context.params
  const catalogEntry = await prisma.practiceTag.findUnique({
    where: { id: parameters.id },
  })
  if (!catalogEntry) return respond({ error: "Tag not found" }, 404)

  const affectedPractices = await prisma.practice.findMany({
    where: { tags: { has: catalogEntry.name } },
    select: { id: true, tags: true },
  })

  await prisma.$transaction([
    ...affectedPractices.map((practice) =>
      prisma.practice.update({
        where: { id: practice.id },
        data: {
          tags: practice.tags.filter((name) => name !== catalogEntry.name),
        },
      })
    ),
    prisma.practiceTag.delete({ where: { id: catalogEntry.id } }),
  ])

  return respond({ ok: true })
}
