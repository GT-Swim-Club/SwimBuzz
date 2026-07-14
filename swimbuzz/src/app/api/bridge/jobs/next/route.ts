import { NextResponse } from "next/server"
import { claimNextBridgeJob } from "@/lib/bridge"
import { requireBridgeConnection } from "@/lib/bridge-auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: Request) {
  const { connection, error } = await requireBridgeConnection(req)
  if (!connection) {
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 })
  }

  const deadline = Date.now() + 25_000

  while (Date.now() < deadline) {
    if (req.signal.aborted) {
      return new NextResponse(null, { status: 499 })
    }

    // Exit promptly when the app terminates this scraper session.
    const stillConnected = await prisma.bridgeConnection.findUnique({
      where: { id: connection.id },
      select: { id: true },
    })
    if (!stillConnected) {
      return NextResponse.json({ shutdown: true }, { status: 410 })
    }

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
