import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { Course } from "@prisma/client"

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

function parseCourse(event: string, rawCourse: string): Course {
    const upper = (rawCourse ?? "").trim().toUpperCase()
    if (upper === "SCY" || upper === "Y") return Course.SCY
    if (upper === "LCM" || upper === "L") return Course.LCM
    if (upper === "SCM" || upper === "S") return Course.SCM
  
    if (event.includes("SCY") || event.endsWith(" Y")) return Course.SCY
    if (event.includes("LCM") || event.endsWith(" L")) return Course.LCM
    if (event.includes("SCM") || event.endsWith(" S")) return Course.SCM
  
    return Course.SCY
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

  const swims = []
let skippedBadDate = 0
for (const swim of times) {
  const timeMs = parseSwimTime(swim.time)
  if (!timeMs) continue

  const date = new Date(swim.date?.trim())
  if (isNaN(date.getTime())) {
    continue
  }

  const course = parseCourse(swim.event, swim.course)
  const event = swim.event.replace(/\s+(SCY|LCM|SCM|Y|L|S)$/i, "").trim()

  swims.push({ athleteId, event, timeMs, course, date, source: "swimcloud" , meet: swim.meet, tags: swim.tags})
}
console.log("total parsed:", swims.length)
console.log("sample:", swims.slice(0, 3))
const result = await prisma.swim.createMany({
  data: swims,
  skipDuplicates: true, 
})
console.log(swims)
return NextResponse.json({ imported: result.count })
}