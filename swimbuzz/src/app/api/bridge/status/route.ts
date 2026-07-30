import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { disconnectBridge, getActiveBridgeConnection } from "@/lib/bridge"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const connection = await getActiveBridgeConnection(session.user.id)
    return NextResponse.json({
      connected: !!connection,
      lastSeenAt: connection?.lastSeenAt.toISOString() ?? null,
    })
  } catch (err) {
    console.error("[bridge/status]", err)
    return NextResponse.json(
      {
        error:
          "Bridge service unavailable — restart the dev server after running `npx prisma generate`",
      },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await disconnectBridge(session.user.id)
  return NextResponse.json({ ok: true })
}
