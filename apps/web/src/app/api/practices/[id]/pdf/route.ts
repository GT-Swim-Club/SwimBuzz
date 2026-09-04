import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isStaffRole } from "@/lib/auth/auth-roles"
import { getSession } from "@/lib/auth/session"
import { buildPracticePdf, practicePdfFilename } from "@/lib/practice/practice-pdf"
import { practiceSetSelect } from "@/lib/practice/practice-input"
import { zonedDayKey } from "@swimbuzz/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: { sets: { orderBy: { order: "asc" }, select: practiceSetSelect } },
  })
  if (!practice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const staff = isStaffRole(session.user.role)
  if (!practice.published && !staff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const totalDistance = practice.sets.reduce((sum, set) => sum + (set.distance ?? 0), 0)
  const startsAt = practice.startsAt ?? practice.createdAt
  const endsAt = practice.endsAt ?? startsAt
  const doc = buildPracticePdf({
    title: practice.title,
    published: practice.published,
    showDraft: staff,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timeZone: practice.timeZone,
    location: practice.location,
    focus: practice.focus,
    tags: practice.tags,
    sets: practice.sets.map((set) => ({
      title: set.title,
      content: set.content,
      distance: set.distance,
    })),
    totalDistance,
  })

  const bytes = new Uint8Array(doc.output("arraybuffer"))
  const filename = practicePdfFilename(practice.title, zonedDayKey(startsAt, practice.timeZone))

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
