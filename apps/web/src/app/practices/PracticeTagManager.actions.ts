"use server"

import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"
import { prisma } from "@/lib/prisma"
import { listManagedPracticeTags } from "@/lib/practice-tag-catalog"
import { normalizeTag, PRACTICE_TAG_MAX_COUNT, PRACTICE_TAG_NAME_MAX_LENGTH } from "@/lib/practice-tags"

/** Same logic as POST /api/practice-tags. */
export async function createPracticeTag(name: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const normalized = normalizeTag(name)
  if (!normalized) throw new Error("Enter a tag name")
  if (normalized.length > PRACTICE_TAG_NAME_MAX_LENGTH) {
    throw new Error("Tags must be " + PRACTICE_TAG_NAME_MAX_LENGTH + " characters or fewer")
  }

  const managedTags = await listManagedPracticeTags()
  const existingEntry = managedTags.find(
    (tag) => tag.name.toLowerCase() === normalized.toLowerCase()
  )
  if (existingEntry) throw new Error("That tag already exists")
  if (managedTags.length >= PRACTICE_TAG_MAX_COUNT) {
    throw new Error("A maximum of " + PRACTICE_TAG_MAX_COUNT + " practice tags is allowed")
  }

  const createdEntry = await prisma.practiceTag.create({
    data: { name: normalized },
    select: { id: true, name: true }})

  revalidatePath("/practices", "page")
  revalidatePath("/practices/[id]", "page")
  return createdEntry
}

/** Same logic as DELETE /api/practice-tags/[id]. */
export async function deletePracticeTag(tagId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) throw new Error("Forbidden")

  const catalogEntry = await prisma.practiceTag.findUnique({ where: { id: tagId } })
  if (!catalogEntry) throw new Error("Tag not found")

  const affectedPractices = await prisma.practice.findMany({
    where: { tags: { has: catalogEntry.name } },
    select: { id: true, tags: true }})

  await prisma.$transaction([
    ...affectedPractices.map((practice) =>
      prisma.practice.update({
        where: { id: practice.id },
        data: { tags: practice.tags.filter((name) => name !== catalogEntry.name) }})
    ),
    prisma.practiceTag.delete({ where: { id: catalogEntry.id } }),
  ])

  revalidatePath("/practices", "page")
  revalidatePath("/practices/[id]", "page")
}
