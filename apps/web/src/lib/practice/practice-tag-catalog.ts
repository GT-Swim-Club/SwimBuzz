import { prisma } from "@/lib/prisma"
import { DEFAULT_PRACTICE_TAGS, normalizeTags } from "@/lib/practice/practice-tags"

/**
 * Ensures the shared catalog starts with the former defaults and every tag that
 * is already assigned to a practice, so existing practice metadata remains usable.
 */
export async function listManagedPracticeTags() {
  const [catalog, practices] = await Promise.all([
    prisma.practiceTag.findMany({ select: { id: true, name: true } }),
    prisma.practice.findMany({ select: { tags: true } }),
  ])

  const existing = new Set(catalog.map((tag) => tag.name.toLowerCase()))
  const seedNames = normalizeTags([
    ...(catalog.length === 0 ? DEFAULT_PRACTICE_TAGS : []),
    ...practices.flatMap((practice) => practice.tags),
  ])
  const missing = seedNames.filter((name) => !existing.has(name.toLowerCase()))

  if (missing.length) {
    await prisma.practiceTag.createMany({
      data: missing.map((name) => ({ name })),
      skipDuplicates: true,
    })
  }

  return prisma.practiceTag.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function listManagedPracticeTagNames() {
  const tags = await listManagedPracticeTags()
  return tags.map((tag) => tag.name)
}

export async function findUnmanagedPracticeTags(tags: string[]) {
  const available = await listManagedPracticeTagNames()
  const availableNames = new Set(available.map((name) => name.toLowerCase()))
  return tags.filter((tag) => !availableNames.has(tag.toLowerCase()))
}
