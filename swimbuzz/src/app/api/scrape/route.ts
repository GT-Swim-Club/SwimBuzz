import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { ScraperJobType } from "@prisma/client"
import { swimsFromSwimCloudTimes, type SwimCloudTime } from "@/lib/swimcloud-import"
import { assignSwimOccurrences } from "@/lib/swim-dedup"
import { runScraperJob } from "@/lib/scraper"
import { LOCAL_SCRAPER_HINT } from "@/lib/scraper-proxy"

export const runtime = "nodejs"
export const maxDuration = 3600

async function fetchSwimCloudTimes(
  userId: string,
  swimmerCloudId: number
): Promise<SwimCloudTime[]> {
  const scraped = await runScraperJob<{
    swimmers: Record<string, SwimCloudTime[]>
    failed: number[]
  }>(userId, ScraperJobType.TIMES_BULK, { swimmer_ids: [swimmerCloudId] })

  if (scraped.failed?.includes(swimmerCloudId)) {
    throw new Error("SwimCloud scrape failed for this athlete")
  }

  return scraped.swimmers[String(swimmerCloudId)] ?? []
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "COACH") {
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
      return NextResponse.json({ error: LOCAL_SCRAPER_HINT }, { status: 503 })
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
