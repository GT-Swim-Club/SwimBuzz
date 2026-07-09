import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { BridgeJobType } from "@prisma/client"
import { swimsFromSwimCloudTimes, type SwimCloudTime } from "@/lib/swimcloud-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { parseScraperError } from "@/lib/scraper-errors"
import { assignSwimOccurrences } from "@/lib/swim-dedup"
import { getActiveBridgeConnection, runBridgeJob } from "@/lib/bridge"

export const runtime = "nodejs"
export const maxDuration = 3600

async function fetchSwimCloudTimes(
  userId: string,
  swimmerCloudId: number
): Promise<SwimCloudTime[]> {
  const bridgeConnected = !!(await getActiveBridgeConnection(userId))

  if (bridgeConnected) {
    const scraped = await runBridgeJob<{
      swimmers: Record<string, SwimCloudTime[]>
      failed: number[]
    }>(userId, BridgeJobType.TIMES_BULK, { swimmer_ids: [swimmerCloudId] })

    if (scraped.failed?.includes(swimmerCloudId)) {
      throw new Error("SwimCloud scrape failed for this athlete")
    }

    return scraped.swimmers[String(swimmerCloudId)] ?? []
  }

  if (process.env.RENDER && SCRAPER_URL.includes("localhost")) {
    throw new Error(
      "Local sync is not connected. Open Local sync, generate a connect command, and run the bridge on your computer."
    )
  }

  let res: Response
  try {
    res = await fetchScraper(`${SCRAPER_URL}/times?swimmer_id=${swimmerCloudId}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : "connection failed"
    throw new Error(`Could not reach scraper at ${SCRAPER_URL}: ${message}`)
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    let parsed: unknown = raw
    try {
      parsed = JSON.parse(raw)
    } catch {
      // keep raw text
    }
    throw new Error(parseScraperError(parsed, `Scraper returned ${res.status}`))
  }

  return (await res.json()) as SwimCloudTime[]
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { athleteId, swimmerCloudId } = await req.json()

  if (!athleteId || !swimmerCloudId) {
    return NextResponse.json({ error: "Missing athleteId or swimmerCloudId" }, { status: 400 })
  }

  let times: SwimCloudTime[]
  try {
    times = await fetchSwimCloudTimes(session.user.id, swimmerCloudId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed"
    if (message === "LOCAL_BRIDGE_NOT_CONNECTED") {
      return NextResponse.json(
        {
          error:
            "Local sync is not connected. Open Local sync, generate a connect command, and run the bridge on your computer.",
        },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const swims = assignSwimOccurrences(swimsFromSwimCloudTimes(times, athleteId))

  const result = await prisma.swim.createMany({
    data: swims,
    skipDuplicates: true,
  })

  const syncedAt = new Date()
  await prisma.athlete.update({
    where: { id: athleteId },
    data: { timesSyncedAt: syncedAt },
  })

  return NextResponse.json({ imported: result.count, timesSyncedAt: syncedAt.toISOString() })
}
