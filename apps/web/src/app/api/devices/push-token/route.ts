import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const token = String(body.token ?? "").trim()
  const platform = String(body.platform ?? "").trim()
  const deviceId =
    typeof body.deviceId === "string" ? body.deviceId.trim() : null

  if (!token || (platform !== "ios" && platform !== "android")) {
    return NextResponse.json(
      { error: "token and platform (ios|android) are required" },
      { status: 400 }
    )
  }

  await prisma.devicePushToken.upsert({
    where: { token },
    create: {
      userId: session.user.id,
      token,
      platform,
      deviceId,
    },
    update: {
      userId: session.user.id,
      platform,
      deviceId,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const token = String(body.token ?? "").trim()
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 })
  }

  await prisma.devicePushToken.deleteMany({
    where: { token, userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
