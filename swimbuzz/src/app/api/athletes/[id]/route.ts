import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { normalizeNicknames } from "@/lib/athlete-match"
import { Gender, type Prisma } from "@prisma/client"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()

  const athlete = await prisma.athlete.findUnique({ where: { id } })
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const data: Prisma.AthleteUpdateInput = {}

  if (typeof body.firstName === "string") {
    const firstName = body.firstName.trim()
    if (!firstName) {
      return NextResponse.json({ error: "First name cannot be empty" }, { status: 400 })
    }
    data.firstName = firstName
  }

  if (typeof body.lastName === "string") {
    const lastName = body.lastName.trim()
    if (!lastName) {
      return NextResponse.json({ error: "Last name cannot be empty" }, { status: 400 })
    }
    data.lastName = lastName
  }

  if (body.gender === "M" || body.gender === "F") {
    data.gender = body.gender === "F" ? Gender.F : Gender.M
  }

  if ("nicknames" in body) {
    data.nicknames = normalizeNicknames(body.nicknames)
  }

  if ("swimCloudId" in body) {
    if (body.swimCloudId === null || body.swimCloudId === "") {
      data.swimCloudId = null
    } else {
      const swimCloudId = parseInt(String(body.swimCloudId), 10)
      if (!Number.isFinite(swimCloudId) || swimCloudId <= 0) {
        return NextResponse.json({ error: "SwimCloud ID must be a positive number" }, { status: 400 })
      }
      const existing = await prisma.athlete.findFirst({
        where: { swimCloudId, id: { not: id } },
      })
      if (existing) {
        return NextResponse.json({ error: "An athlete with this SwimCloud ID already exists" }, { status: 409 })
      }
      data.swimCloudId = swimCloudId
    }
  }

  // Email + display name live on the linked User record.
  let email: string | null = null
  if (typeof body.email === "string") {
    email = body.email.trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: "Email cannot be empty" }, { status: 400 })
    }
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser && existingUser.id !== athlete.userId) {
      return NextResponse.json({ error: "Another user already has this email" }, { status: 409 })
    }
  }

  if (Object.keys(data).length === 0 && email === null) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.athlete.update({ where: { id }, data })

    const nameChanged = data.firstName !== undefined || data.lastName !== undefined
    if (email !== null || nameChanged) {
      await tx.user.update({
        where: { id: athlete.userId },
        data: {
          ...(email !== null ? { email } : {}),
          ...(nameChanged ? { name: `${result.firstName} ${result.lastName}` } : {}),
        },
      })
    }

    return result
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: { user: { select: { id: true, role: true } } },
  })
  if (!athlete) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.$transaction(async (tx) => {
    await tx.swim.deleteMany({ where: { athleteId: id } })
    await tx.athlete.delete({ where: { id } })
    // Remove the auto-provisioned athlete login (cascades sessions/accounts).
    if (athlete.user?.role === "ATHLETE") {
      await tx.user.delete({ where: { id: athlete.user.id } })
    }
  })

  return NextResponse.json({ ok: true })
}
