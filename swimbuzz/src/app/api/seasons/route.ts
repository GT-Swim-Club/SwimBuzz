import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { isStaffRole } from "@/lib/auth-roles"

export async function GET() {
  const seasons = await prisma.season.findMany({
    orderBy: { label: "desc" },
  })
  return NextResponse.json(seasons.map((s) => s.label))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  console.log("Session:", session)
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { label } = await req.json()
  if (!label || typeof label !== "string") {
    return NextResponse.json({ error: "Invalid Label" }, { status: 400 })
  }

  await prisma.season.upsert({
    where: { label },
    update: {},
    create: { label },
  })

  return NextResponse.json({ label }, { status: 201 })
}
