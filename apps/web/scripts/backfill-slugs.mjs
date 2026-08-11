/**
 * Backfill slug fields for existing meets, athletes, and practices.
 * Run after `prisma db push` adds nullable slug columns:
 *   node scripts/backfill-slugs.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function slugify(text) {
  return (
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  )
}

async function backfillAthletes() {
  const athletes = await prisma.athlete.findMany({
    where: { slug: null },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { id: "asc" },
  })
  const used = new Set(
    (await prisma.athlete.findMany({ where: { slug: { not: null } }, select: { slug: true } }))
      .map((a) => a.slug)
      .filter(Boolean)
  )

  for (const athlete of athletes) {
    const base = slugify(`${athlete.firstName}-${athlete.lastName}`)
    let slug = base
    let n = 2
    while (used.has(slug)) {
      slug = `${base}-${n}`
      n++
    }
    used.add(slug)
    await prisma.athlete.update({ where: { id: athlete.id }, data: { slug } })
  }
  console.log(`Backfilled ${athletes.length} athlete slug(s)`)
}

async function backfillMeets() {
  const meets = await prisma.meet.findMany({
    where: { slug: null },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  })
  const used = new Set(
    (await prisma.meet.findMany({ where: { slug: { not: null } }, select: { slug: true } }))
      .map((m) => m.slug)
      .filter(Boolean)
  )

  for (const meet of meets) {
    const base = slugify(meet.name)
    let slug = base
    let n = 2
    while (used.has(slug)) {
      slug = `${base}-${n}`
      n++
    }
    used.add(slug)
    await prisma.meet.update({ where: { id: meet.id }, data: { slug } })
  }
  console.log(`Backfilled ${meets.length} meet slug(s)`)
}

function practiceSlugBase(date) {
  if (!date) return "undated"
  return new Date(date).toISOString().slice(0, 10)
}

async function backfillPractices() {
  const practices = await prisma.practice.findMany({
    where: { slug: null },
    select: { id: true, date: true },
    orderBy: { id: "asc" },
  })
  const used = new Set(
    (await prisma.practice.findMany({ where: { slug: { not: null } }, select: { slug: true } }))
      .map((p) => p.slug)
      .filter(Boolean)
  )

  for (const practice of practices) {
    const base = practiceSlugBase(practice.date)
    let slug = base
    let n = 2
    while (used.has(slug)) {
      slug = `${base}-${n}`
      n++
    }
    used.add(slug)
    await prisma.practice.update({ where: { id: practice.id }, data: { slug } })
  }
  console.log(`Backfilled ${practices.length} practice slug(s)`)
}

async function main() {
  await backfillAthletes()
  await backfillMeets()
  await backfillPractices()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
