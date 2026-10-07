"use server"

import { revalidatePath } from "next/cache"
import { isStaffRole } from "@swimbuzz/shared"
import {
  AVATAR_MAX_BYTES,
  deleteStoredAvatar,
  isStoredAvatarUrl,
  uploadAvatar } from "@/lib/athlete/avatar-storage"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"

/** Shared with POST/DELETE /api/profile/avatar — same logic, kept in sync
 * manually since the route can't be refactored without risking the
 * mobile-facing contract. */

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

function isUpload(value: unknown): value is File {
  return (
    value != null &&
    typeof value !== "string" &&
    typeof (value as File).arrayBuffer === "function"
  )
}

async function requireEditableSession() {
  const session = await getSession()
  if (!session?.user?.id) throw new Error("Unauthorized")
  if (isStaffRole(session.user.role)) {
    throw new Error("Coaches and execs can't change their profile picture")
  }
  return session
}

export async function uploadProfileAvatar(formData: FormData) {
  const session = await requireEditableSession()

  const file = formData.get("file")
  if (!isUpload(file)) throw new Error("Image is required")

  const contentType = (file.type || "").toLowerCase()
  if (!ALLOWED_TYPES.has(contentType)) throw new Error("Use a JPEG, PNG, or WebP image")

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) throw new Error("Image is empty")
  if (bytes.length > AVATAR_MAX_BYTES) {
    throw new Error("Image must be 256 KB or smaller after compression")
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true }})

  const { url } = await uploadAvatar(
    session.user.id,
    bytes,
    contentType === "image/jpg" ? "image/jpeg" : contentType
  )

  await prisma.user.update({ where: { id: session.user.id }, data: { image: url } })

  const previous = existing?.image
  if (previous && isStoredAvatarUrl(previous) && !previous.includes(`/${session.user.id}.jpg`)) {
    await deleteStoredAvatar(previous).catch(() => {})
  }

  revalidatePath("/", "layout")
  return { image: url }
}

export async function removeProfileAvatar() {
  const session = await requireEditableSession()

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { image: true }})

  await prisma.user.update({ where: { id: session.user.id }, data: { image: null } })

  if (existing?.image) {
    await deleteStoredAvatar(existing.image).catch(() => {})
  }

  revalidatePath("/", "layout")
  return { image: null }
}
