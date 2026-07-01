import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
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

  await prisma.swim.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
