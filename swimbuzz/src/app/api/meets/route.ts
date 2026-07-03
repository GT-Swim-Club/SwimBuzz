import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { buildMeetData, MeetInputError } from "@/lib/meet-input"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const meets = await prisma.meet.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { swims: true } } },
  })

  return NextResponse.json(meets)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()

  try {
    const data = buildMeetData(body, { requireName: true, requireStartDate: true })
    const meet = await prisma.meet.create({ data: data as Parameters<typeof prisma.meet.create>[0]["data"] })
    return NextResponse.json(meet, { status: 201 })
  } catch (err) {
    if (err instanceof MeetInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
