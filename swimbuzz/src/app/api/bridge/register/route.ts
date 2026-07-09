import { NextResponse } from "next/server"
import { registerBridgeConnection } from "@/lib/bridge"

export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({}))
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Pairing code is required" }, { status: 400 })
  }

  try {
    const connection = await registerBridgeConnection(code.trim())
    return NextResponse.json({
      token: connection.token,
      connectionId: connection.id,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Registration failed" },
      { status: 400 }
    )
  }
}
