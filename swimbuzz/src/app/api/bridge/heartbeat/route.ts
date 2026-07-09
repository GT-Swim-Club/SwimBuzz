import { NextResponse } from "next/server"
import { requireBridgeConnection } from "@/lib/bridge-auth"

export async function POST(req: Request) {
  const { connection, error } = await requireBridgeConnection(req)
  if (!connection) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
