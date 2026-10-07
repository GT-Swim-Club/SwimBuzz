"use server"

import { revalidatePath } from "next/cache"
import { Gender } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeNicknames } from "@/lib/athlete/athlete-match"
import { parseSeasonList } from "@/lib/season"
import { parseSwimCloudId, SWIMCLOUD_ID_ERROR } from "@/lib/swim/swimcloud-id"
import { uniqueAthleteSlug } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export type AddAthleteInput = {
  firstName: string
  lastName: string
  email: string
  swimCloudId?: string
  nicknames?: string[]
  gender: "M" | "F"
  seasons: string[]
}

/** Same logic as POST /api/athletes. */
export async function addAthlete(input: AddAthleteInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  const email = input.email.trim().toLowerCase()
  const nicknames = normalizeNicknames(input.nicknames)
  const gender = input.gender === "F" ? Gender.F : Gender.M
  const seasons = parseSeasonList(input.seasons)
  const swimCloudIdRaw = input.swimCloudId
  const swimCloudIdEmpty = swimCloudIdRaw === undefined || swimCloudIdRaw === ""
  const swimCloudId = swimCloudIdEmpty ? null : parseSwimCloudId(swimCloudIdRaw)

  if (!firstName || !lastName || !email) {
    throw new Error("First name, last name, and email are required")
  }
  if (seasons.length === 0) {
    throw new Error("Season is required (e.g. 2025–2026)")
  }
  if (!swimCloudIdEmpty && swimCloudId === null) {
    throw new Error(SWIMCLOUD_ID_ERROR)
  }

  if (swimCloudId !== null) {
    const existingBySwimCloud = await prisma.athlete.findFirst({ where: { swimCloudId } })
    if (existingBySwimCloud) {
      throw new Error("An athlete with this SwimCloud ID already exists")
    }
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { athlete: true }})
  if (existingUser?.athlete) {
    throw new Error("An athlete with this email already exists")
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
    if (err instanceof Error && err.message === "DUPLICATE_ATHLETE") return null
    throw err
  })

  if (!athlete) {
    throw new Error("An athlete with this email already exists")
  }

  revalidatePath("/athletes")
  return athlete
}
