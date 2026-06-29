import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"   
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { athleteId, event, timeMs, course, date, source } = await req.json()

  const swim = await prisma.swim.create({
    data: {
      athleteId,
      event,
      timeMs,
      course,
      date: new Date(date),
      source: source ?? "manual",
    },
  })

  return NextResponse.json(swim, { status: 201 })
}