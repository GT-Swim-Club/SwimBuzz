import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizePreferredName } from "@/lib/athlete/athlete-match"
import { Gender } from "@prisma/client"
import { parseSeasonList } from "@/lib/season"
import {
  resolveSwimCloudProfilesUpdate,
  SwimCloudProfileError,
  withLegacySwimCloudId,
  type SwimCloudProfiles,
} from "@/lib/swim/swimcloud-profiles"
import { uniqueAthleteSlug } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { redactAthleteForViewer } from "@/lib/athlete/athlete-privacy"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // No `swims` relation here — it was fetched (as an N+1: Prisma can't batch
  // a per-parent `take`) but never consumed by any client of this route.
  const athletes = await prisma.athlete.findMany({
    include: {
      user: { select: { name: true, email: true, image: true, staffTitle: true } }},
    orderBy: { lastName: "asc" }})

  return NextResponse.json(
    athletes.map((athlete) => withLegacySwimCloudId(redactAthleteForViewer(athlete, session))),
    {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=300" }}
  )
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const firstName = String(body.firstName ?? "").trim()
  const lastName = String(body.lastName ?? "").trim()
  const email = String(body.email ?? "").trim().toLowerCase()
  const preferredName = normalizePreferredName(body.preferredName)
  const gender = body.gender === "F" ? Gender.F : Gender.M
  const seasons = parseSeasonList(body.seasons)

  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "First name, last name, and email are required" }, { status: 400 })
  }
  if (seasons.length === 0) {
    return NextResponse.json({ error: "Season is required (e.g. 2025–2026)" }, { status: 400 })
  }

  let swimCloud: SwimCloudProfiles
  try {
    // swimCloudIds, or legacy swimCloudId from older mobile builds.
    swimCloud = await resolveSwimCloudProfilesUpdate(
      { swimCloudIds: [] },
      { swimCloudIds: body.swimCloudIds, swimCloudId: body.swimCloudId }
    )
  } catch (err) {
    if (!(err instanceof SwimCloudProfileError)) throw err
    return NextResponse.json({ error: err.message }, { status: err.status })
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
        preferredName,
        gender,
        seasons,
        ...swimCloud}})
  }).catch((err) => {
    if (err.message === "DUPLICATE_ATHLETE") return null
    throw err
  })

  if (!athlete) {
    return NextResponse.json({ error: "An athlete with this email already exists" }, { status: 409 })
  }

  return NextResponse.json(withLegacySwimCloudId(athlete), { status: 201 })
}
