import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { normalizeNicknames } from "@/lib/athlete-match"
import { Gender } from "@prisma/client"
import { parseSeasonList } from "@/lib/season"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const athletes = await prisma.athlete.findMany({
    include: {
      user: { select: { name: true, email: true, image: true } },
      swims: {
        orderBy: { timeMs: "asc" },
        take: 1,
      },
    },
    orderBy: { lastName: "asc" },
  })

  return NextResponse.json(athletes)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const firstName = String(body.firstName ?? "").trim()
  const lastName = String(body.lastName ?? "").trim()
  const email = String(body.email ?? "").trim().toLowerCase()
  const nicknames = normalizeNicknames(body.nicknames)
  const gender = body.gender === "F" ? Gender.F : Gender.M
  const seasons = parseSeasonList(body.seasons)
  const swimCloudIdRaw = body.swimCloudId
  const swimCloudId =
    swimCloudIdRaw === null || swimCloudIdRaw === undefined || swimCloudIdRaw === ""
      ? null
      : parseInt(String(swimCloudIdRaw), 10)

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "First name, last name, and email are required" }, { status: 400 })
  }
  if (seasons.length === 0) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }
  if (swimCloudId !== null && (!Number.isFinite(swimCloudId) || swimCloudId <= 0)) {
    return NextResponse.json({ error: "SwimCloud ID must be a positive number" }, { status: 400 })
  }

  if (swimCloudId !== null) {
    const existingBySwimCloud = await prisma.athlete.findFirst({ where: { swimCloudId } })
    if (existingBySwimCloud) {
      return NextResponse.json({ error: "An athlete with this SwimCloud ID already exists" }, { status: 409 })
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { athlete: true },
  })
  if (existingUser?.athlete) {
    return NextResponse.json({ error: "An athlete with this email already exists" }, { status: 409 })
  }

  const athlete = await prisma.$transaction(async (tx) => {
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email,
          name: `${firstName} ${lastName}`,
          role: "ATHLETE",
        },
        include: { athlete: true },
      }))

    if (user.athlete) {
      throw new Error("DUPLICATE_ATHLETE")
    }

    return tx.athlete.create({
      data: {
        userId: user.id,
        firstName,
        lastName,
        nicknames,
        gender,
        seasons,
        ...(swimCloudId !== null ? { swimCloudId } : {}),
      },
    })
  }).catch((err) => {
    if (err.message === "DUPLICATE_ATHLETE") return null
    throw err
  })

  if (!athlete) {
    return NextResponse.json({ error: "An athlete with this email already exists" }, { status: 409 })
  }

  return NextResponse.json(athlete, { status: 201 })
}
