/**
 * Backfill startsAt/endsAt/hasStartTime/hasEndTime for existing practices and meets,
 * from the legacy date/startTime/endTime (Practice) and startDate/startTime/endDate
 * (Meet) columns. Run after `prisma db push` adds the new nullable columns:
 *   node scripts/backfill-datetimes.mjs
 *
 * zonedTimeToUtc is copied verbatim from packages/shared/src/timezone.ts rather than
 * imported across the workspace boundary, matching how backfill-slugs.mjs inlines slugify.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function offsetMsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const map = {}
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  )
  return asUtc - instant.getTime()
}

function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const [year, month, day] = dateStr.split("-").map(Number)
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim())
  const hour = match ? Number(match[1]) : 0
  const minute = match ? Number(match[2]) : 0
  const guessUtc = Date.UTC(year, (month || 1) - 1, day || 1, hour, minute, 0)
  const firstOffset = offsetMsAt(new Date(guessUtc), timeZone)
  const refinedOffset = offsetMsAt(new Date(guessUtc - firstOffset), timeZone)
  return new Date(guessUtc - refinedOffset)
}

function utcDayKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function practiceSlugBase(dayKey) {
  return dayKey || "undated"
}

async function backfillPractices() {
  const practices = await prisma.practice.findMany({
    where: { startsAt: null },
    select: {
      id: true,
      slug: true,
      date: true,
      startTime: true,
      endTime: true,
      timeZone: true,
      createdAt: true,
    },
    orderBy: { id: "asc" },
  })

  let slugDrift = 0
  for (const practice of practices) {
    const dayKey = utcDayKey(practice.date ?? practice.createdAt)
    const startsAt = zonedTimeToUtc(dayKey, practice.startTime, practice.timeZone)
    let endsAt = zonedTimeToUtc(dayKey, practice.endTime, practice.timeZone)
    if (endsAt.getTime() < startsAt.getTime()) {
      // Crosses midnight — the legacy end time is earlier in the day than the start time.
      endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000)
    }

    await prisma.practice.update({
      where: { id: practice.id },
      data: { startsAt, endsAt },
    })

    const recomputedSlugBase = practiceSlugBase(dayKey)
    if (practice.slug && !practice.slug.startsWith(recomputedSlugBase)) {
      slugDrift++
      console.warn(
        `Practice ${practice.id}: stored slug "${practice.slug}" does not start with recomputed base "${recomputedSlugBase}"`
      )
    }
  }
  console.log(`Backfilled ${practices.length} practice(s), ${slugDrift} slug drift warning(s)`)
}

async function backfillMeets() {
  const meets = await prisma.meet.findMany({
    where: { startsAt: null },
    select: {
      id: true,
      startDate: true,
      startTime: true,
      endDate: true,
      timeZone: true,
    },
    orderBy: { id: "asc" },
  })

  for (const meet of meets) {
    const dayKey = utcDayKey(meet.startDate)
    const hasStartTime = Boolean(meet.startTime)
    const startsAt = zonedTimeToUtc(dayKey, meet.startTime || "00:00", meet.timeZone)

    let endsAt = null
    const hasEndTime = false
    if (meet.endDate) {
      const endDayKey = utcDayKey(meet.endDate)
      endsAt = zonedTimeToUtc(endDayKey, "00:00", meet.timeZone)
    }

    await prisma.meet.update({
      where: { id: meet.id },
      data: { startsAt, endsAt, hasStartTime, hasEndTime },
    })
  }
  console.log(`Backfilled ${meets.length} meet(s)`)
}

async function main() {
  await backfillPractices()
  await backfillMeets()
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
