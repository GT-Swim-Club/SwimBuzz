import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { swimsFromSwimCloudTimes, type SwimCloudTime } from "@/lib/swimcloud-import"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { assignSwimOccurrences } from "@/lib/swim-dedup"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { athleteId, swimmerCloudId } = await req.json()

  if (!athleteId || !swimmerCloudId) {
    return NextResponse.json({ error: "Missing athleteId or swimmerCloudId" }, { status: 400 })
  }

  const res = await fetchScraper(`${SCRAPER_URL}/times?swimmer_id=${swimmerCloudId}`)
  if (!res.ok) {
    return NextResponse.json({ error: "Scraper failed" }, { status: 502 })
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
