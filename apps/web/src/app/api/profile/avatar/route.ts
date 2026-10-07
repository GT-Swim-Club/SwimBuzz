import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import {
  AVATAR_MAX_BYTES,
  deleteStoredAvatar,
  isStoredAvatarUrl,
  uploadAvatar } from "@/lib/athlete/avatar-storage"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

export const runtime = "nodejs"

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

function isUpload(value: unknown): value is File {
  return (
    value != null &&
    typeof value !== "string" &&
    typeof (value as File).arrayBuffer === "function"
  )
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (isStaffRole(session.user.role)) {
    return NextResponse.json(
      { error: "Coaches and execs can't change their profile picture" },
      { status: 403 }
    )
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!isUpload(file)) {
    return NextResponse.json({ error: "Image is required" }, { status: 400 })
  }

  const contentType = (file.type || "").toLowerCase()
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: "Use a JPEG, PNG, or WebP image" },
      { status: 400 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) {
    return NextResponse.json({ error: "Image is empty" }, { status: 400 })
  }
  if (bytes.length > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be 256 KB or smaller after compression" },
      { status: 400 }
    )
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true }})

  try {
    const { url } = await uploadAvatar(
      session.user.id,
      bytes,
      contentType === "image/jpg" ? "image/jpeg" : contentType
    )

    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: url }})

    // Previous custom avatar used the same storage path (upsert). Only delete
    // if somehow stored under a different path.
    const previous = existing?.image
    if (
      previous &&
      isStoredAvatarUrl(previous) &&
      !previous.includes(`/${session.user.id}.jpg`)
    ) {
      await deleteStoredAvatar(previous).catch(() => {})
    }

    return NextResponse.json({ image: url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function DELETE() {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (isStaffRole(session.user.role)) {
    return NextResponse.json(
      { error: "Coaches and execs can't change their profile picture" },
      { status: 403 }
    )
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true }})

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { image: null }})

    if (existing?.image) {
      await deleteStoredAvatar(existing.image).catch(() => {})
    }

    return NextResponse.json({ image: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Remove failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
