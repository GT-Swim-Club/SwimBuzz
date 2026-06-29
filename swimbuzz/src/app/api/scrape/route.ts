import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://localhost:8000"

// parse "1:23.45" or "58.32" → milliseconds
function parseSwimTime(timeStr: string): number | null {
  if (!timeStr) return null
  const parts = timeStr.trim().split(":")
  if (parts.length === 2) {
    return Math.round((parseInt(parts[0]) * 60 + parseFloat(parts[1])) * 1000)
  }
  return Math.round(parseFloat(parts[0]) * 1000)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "MEET_DIRECTOR"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { athleteId, swimmerCloudId } = await req.json()

  if (!athleteId || !swimmerCloudId) {
    return NextResponse.json({ error: "Missing athleteId or swimmerCloudId" }, { status: 400 })
  }

  // fetch from python service
  const res = await fetch(`${SCRAPER_URL}/times?swimmer_id=${swimmerCloudId}`)
  if (!res.ok) {
    return NextResponse.json({ error: "Scraper failed" }, { status: 502 })
  }

  const times = await res.json()
  let imported = 0

  for (const swim of times) {
    const timeMs = parseSwimTime(swim.time)
    if (!timeMs) continue

    // upsert — don't create duplicates if scraped twice
    await prisma.swim.upsert({
      where: {
        // you'll add this unique constraint to your schema below
        athleteId_event_timeMs_date: {
          athleteId,
          event: swim.event,
          timeMs,
          date: new Date(swim.date),
        },
      },
      update: {},
      create: {
        athleteId,
        event: swim.event,
        timeMs,
        course: swim.course ?? "SCY",
        date: new Date(swim.date),
        source: "swimcloud",
      },
    })
    imported++
  }

  return NextResponse.json({ imported })
}