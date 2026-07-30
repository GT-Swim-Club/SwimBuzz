import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { createBridgePairing } from "@/lib/bridge"

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const pairing = await createBridgePairing(session.user.id)
    return NextResponse.json({
      code: pairing.code,
      expiresAt: pairing.expiresAt.toISOString(),
    })
  } catch (err) {
    console.error("[bridge/pairing]", err)
    const message = err instanceof Error ? err.message : "Could not generate code"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
