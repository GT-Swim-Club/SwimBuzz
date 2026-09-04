import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isStaffRole } from "@/lib/auth/auth-roles"
import { getSession } from "@/lib/auth/session"

export async function GET() {
  const seasons = await prisma.season.findMany({
    orderBy: { label: "desc" }})
  return NextResponse.json(seasons.map((s) => s.label), {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=3600" }})
}

export async function POST(req: Request) {
  const session = await getSession()
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
    create: { label }})

  return NextResponse.json({ label }, { status: 201 })
}
