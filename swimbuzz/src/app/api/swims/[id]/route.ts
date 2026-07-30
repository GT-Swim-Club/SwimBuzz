import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { normalizeSwimForInsert, nextSwimOccurrence } from "@/lib/swim-dedup"
import { isRelayLeadoffSwimTag } from "@/lib/relay-results"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const swim = await prisma.swim.findUnique({ where: { id } })
  if (!swim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (swim.source !== "manual") {
    return NextResponse.json(
      { error: "Only manually logged swims can be edited" },
      { status: 400 }
    )
  }
  if (isRelayLeadoffSwimTag(swim.tags)) {
    return NextResponse.json(
      { error: "Relay leadoff swims can only be edited through the relay" },
      { status: 400 }
    )
  }

  const { athleteId, event, timeMs, course, date, meet, meetId, tags } =
    await req.json()

  if (!athleteId || !event || !Number.isFinite(timeMs) || !course || !date) {
    return NextResponse.json({ error: "Missing required swim fields" }, { status: 400 })
  }

  const base = normalizeSwimForInsert({
    athleteId,
    event,
    timeMs,
    course,
    date,
    source: "manual",
    meet,
    meetId,
    tags: tags ?? swim.tags,
  })

  let occurrence = await nextSwimOccurrence(prisma, base)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await prisma.swim.update({
        where: { id },
        data: { ...base, occurrence },
      })
      return NextResponse.json(updated)
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        occurrence++
        continue
      }
      throw err
    }
  }

  return NextResponse.json(
    { error: "Could not save swim — too many matching duplicates" },
    { status: 409 }
  )
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const swim = await prisma.swim.findUnique({ where: { id } })
  if (!swim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  if (swim.source !== "manual") {
    return NextResponse.json(
      { error: "Only manually logged swims can be deleted" },
      { status: 400 }
    )
  }
  if (isRelayLeadoffSwimTag(swim.tags)) {
    return NextResponse.json(
      { error: "Relay leadoff swims can only be edited through the relay" },
      { status: 400 }
    )
  }

  await prisma.swim.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
