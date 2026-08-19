import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Course } from "@prisma/client"
import { formatDisplayTime, formatTime } from "@/lib/utils"
import { isRelayLeadoffSwimTag } from "@/lib/relay-results"
import { canonicalizeStrokeEvent } from "@/lib/swim-parse"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

function parseCourse(raw: string | null): Course | null {
  const upper = (raw ?? "").trim().toUpperCase()
  if (upper === "SCY" || upper === "Y") return Course.SCY
  if (upper === "LCM" || upper === "L") return Course.LCM
  if (upper === "SCM" || upper === "S") return Course.SCM
  return null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: athleteId } = await params
  const url = new URL(req.url)
  const course = parseCourse(url.searchParams.get("course"))
  if (!course) {
    return NextResponse.json({ error: "Valid course is required (SCY, LCM, or SCM)" }, { status: 400 })
  }

  const eventsParam = url.searchParams.get("events") ?? ""
  const events = [
    ...new Set(
      eventsParam
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
    ),
  ]
  if (events.length === 0) {
    return NextResponse.json({ times: {} as Record<string, string> })
  }

  const isStaff = isStaffRole(session.user.role)
  if (!isStaff) {
    const linked = await prisma.athlete.findUnique({
      where: { userId: session.user.id },
      select: { id: true }})
    if (!linked || linked.id !== athleteId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true }})
  if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 })

  // Packet labels ("50 Freestyle") often differ from SwimCloud names ("50 Free"),
  // so load course swims and match on a canonical stroke form.
  const swims = await prisma.swim.findMany({
    where: { athleteId, course },
    select: { event: true, timeMs: true, tags: true },
    orderBy: { timeMs: "asc" }})

  const bestByCanonical = new Map<string, number>()
  for (const swim of swims) {
    if (isRelayLeadoffSwimTag(swim.tags ?? "")) continue
    const key = canonicalizeStrokeEvent(swim.event).toLowerCase()
    if (!key || bestByCanonical.has(key)) continue
    bestByCanonical.set(key, swim.timeMs)
  }

  const times: Record<string, string> = {}
  for (const event of events) {
    const ms = bestByCanonical.get(canonicalizeStrokeEvent(event).toLowerCase())
    if (ms == null) continue
    times[event] = formatDisplayTime(formatTime(ms))
  }

  return NextResponse.json({ times, course })
}
