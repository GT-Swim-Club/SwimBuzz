import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"

function normalizeView(value: unknown) {
  return value === "list" ? "list" : "gallery"
}

function normalizePracticesView(value: unknown) {
  return value === "week" || value === "month" || value === "list" ? value : "week"
}

export async function GET() {
  const session = await getSession()
  if (!session) return new NextResponse("Unauthorized", { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { defaultView: true, defaultPracticesView: true },
  })

  return NextResponse.json({
    defaultView: normalizeView(user?.defaultView),
    defaultPracticesView: normalizePracticesView(user?.defaultPracticesView),
  })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return new NextResponse("Unauthorized", { status: 401 })
  const { defaultView, defaultPracticesView } = await req.json()
  
  const data: {
    defaultView?: "list" | "gallery"
    defaultPracticesView?: "week" | "month" | "list"
  } = {}
  if (defaultView) {
    data.defaultView = normalizeView(defaultView)
  }
  if (defaultPracticesView) {
    data.defaultPracticesView = normalizePracticesView(defaultPracticesView)
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { defaultView: true, defaultPracticesView: true },
  })
  return NextResponse.json({
    success: true,
    defaultView: normalizeView(user.defaultView),
    defaultPracticesView: normalizePracticesView(user.defaultPracticesView),
  })
}
