import { NextResponse } from "next/server"
import { claimNextBridgeJob } from "@/lib/bridge"
import { requireBridgeConnection } from "@/lib/bridge-auth"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: Request) {
  const { connection, error } = await requireBridgeConnection(req)
  if (!connection) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 })
  }

  const deadline = Date.now() + 25_000

  while (Date.now() < deadline) {
    const job = await claimNextBridgeJob(connection.id)
    if (job) {
      return NextResponse.json({
        job: {
          id: job.id,
          type: job.type,
          payload: job.payload,
        },
      })
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  return NextResponse.json({ job: null })
}
