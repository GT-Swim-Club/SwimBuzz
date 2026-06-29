import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const athletes = await prisma.athlete.findMany({
    include: {
      user: { select: { name: true, email: true, image: true } },
      swims: {
        orderBy: { timeMs: "asc" },
        take: 1, // just for a quick PB preview
      },
    },
    orderBy: { lastName: "asc" },
  })

  return NextResponse.json(athletes)
}

export async function POST(req: Request) {
  const session = await getServerSession()
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { firstName, lastName, gradYear, userId } = body

  const athlete = await prisma.athlete.create({
    data: { firstName, lastName, gradYear, userId },
  })

  return NextResponse.json(athlete, { status: 201 })
}