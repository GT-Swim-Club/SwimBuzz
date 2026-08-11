import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizeNicknames } from "@/lib/athlete-match"
import { Gender } from "@prisma/client"
import { parseSeasonList } from "@/lib/season"
import { parseSwimCloudId, SWIMCLOUD_ID_ERROR } from "@/lib/swimcloud-id"
import { uniqueAthleteSlug } from "@/lib/slug"
import { getSession } from "@/lib/session"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const athletes = await prisma.athlete.findMany({
    include: {
      user: { select: { name: true, email: true, image: true } },
      swims: {
        orderBy: { timeMs: "asc" },
        take: 1}},
    orderBy: { lastName: "asc" }})

  return NextResponse.json(athletes)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.user.role !== "COACH") {
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
  const swimCloudIdEmpty =
    swimCloudIdRaw === null || swimCloudIdRaw === undefined || swimCloudIdRaw === ""
  const swimCloudId = swimCloudIdEmpty ? null : parseSwimCloudId(swimCloudIdRaw)

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "First name, last name, and email are required" }, { status: 400 })
  }
  if (seasons.length === 0) {
    return NextResponse.json({ error: "Season is required (e.g. 2025-2026)" }, { status: 400 })
  }
  if (!swimCloudIdEmpty && swimCloudId === null) {
    return NextResponse.json({ error: SWIMCLOUD_ID_ERROR }, { status: 400 })
  }

  if (swimCloudId !== null) {
    const existingBySwimCloud = await prisma.athlete.findFirst({ where: { swimCloudId } })
    if (existingBySwimCloud) {
      return NextResponse.json({ error: "An athlete with this SwimCloud ID already exists" }, { status: 409 })
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { athlete: true }})
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
          role: "ATHLETE"},
        include: { athlete: true }}))

    if (user.athlete) {
      throw new Error("DUPLICATE_ATHLETE")
    }

    return tx.athlete.create({
      data: {
        userId: user.id,
        slug: await uniqueAthleteSlug(firstName, lastName),
        firstName,
        lastName,
        nicknames,
        gender,
        seasons,
        ...(swimCloudId !== null ? { swimCloudId } : {})}})
  }).catch((err) => {
    if (err.message === "DUPLICATE_ATHLETE") return null
    throw err
  })

  if (!athlete) {
    return NextResponse.json({ error: "An athlete with this email already exists" }, { status: 409 })
  }

  return NextResponse.json(athlete, { status: 201 })
}
