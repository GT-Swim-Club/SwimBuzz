import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeSwimForInsert, nextSwimOccurrence } from "@/lib/swim-dedup"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session || !isStaffRole(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { athleteId, event, timeMs, course, date, source, meet, meetId, tags } =
      await req.json()

    if (!athleteId || !event || !Number.isFinite(timeMs) || !course || !date) {
      return NextResponse.json({ error: "Missing required swim fields" }, { status: 400 })
    }

    const base = normalizeSwimForInsert({
      athleteId,
      event,
      timeMs,
      course,
      date,
      source: source ?? "manual",
      meet,
      meetId,
      tags})

    let occurrence = await nextSwimOccurrence(prisma, base)

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await prisma.swim.create({
          data: { ...base, occurrence }})
        return NextResponse.json(created, { status: 201 })
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          occurrence++
          continue
        }
        throw err
      }
    }

    return NextResponse.json(
      { error: "Could not save swim — too many matching duplicates" },
      { status: 409 }
    )
  } catch (err) {
    console.error("POST /api/swims failed:", err)

    if (err instanceof Prisma.PrismaClientValidationError) {
      return NextResponse.json(
        {
          error:
            "Database client is out of date — restart the dev server (npm run dev)"},
        { status: 500 }
      )
    }

    return NextResponse.json({ error: "Failed to save swim" }, { status: 500 })
  }
}
