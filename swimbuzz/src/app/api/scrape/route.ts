import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { swimsFromSwimCloudTimes, type SwimCloudTime } from "@/lib/swimcloud-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { assignSwimOccurrences } from "@/lib/swim-dedup"

export const runtime = "nodejs"
export const maxDuration = 3600

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { athleteId, swimmerCloudId } = await req.json()

  if (!athleteId || !swimmerCloudId) {
    return NextResponse.json({ error: "Missing athleteId or swimmerCloudId" }, { status: 400 })
  }

  if (process.env.RENDER && SCRAPER_URL.includes("localhost")) {
    return NextResponse.json(
      {
        error:
          "SCRAPER_URL is not set on Render. In the web service Environment, set it to your scraper URL (e.g. https://swimbuzz-scraper.onrender.com).",
      },
      { status: 503 }
    )
  }

  let res: Response
  try {
    res = await fetchScraper(`${SCRAPER_URL}/times?swimmer_id=${swimmerCloudId}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : "connection failed"
    return NextResponse.json(
      { error: `Could not reach scraper at ${SCRAPER_URL}: ${message}` },
      { status: 502 }
    )
  }

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim()
    return NextResponse.json(
      { error: detail || `Scraper returned ${res.status}` },
      { status: 502 }
    )
  }

  const times = (await res.json()) as SwimCloudTime[]
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
