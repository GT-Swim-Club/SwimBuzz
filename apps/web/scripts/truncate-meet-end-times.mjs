/**
 * One-off: meets no longer have a real end time (only an optional end date for
 * multi-day meets), so before `hasEndTime` is dropped from the schema, truncate any
 * Meet.endsAt that currently carries a real wall-clock time (hasEndTime = true) down
 * to 00:00 in the meet's own timeZone — i.e. just the end date.
 *
 * Run once, before `prisma db push` drops the `hasEndTime` column:
 *   node scripts/truncate-meet-end-times.mjs
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

function zonedDayKey(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const map = {}
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value
  return `${map.year}-${map.month}-${map.day}`
}

async function main() {
  const meets = await prisma.meet.findMany({
    where: { hasEndTime: true, endsAt: { not: null } },
    select: { id: true, endsAt: true, timeZone: true },
  })

  let updated = 0
  for (const meet of meets) {
    const dayKey = zonedDayKey(meet.endsAt, meet.timeZone)
    const truncated = zonedTimeToUtc(dayKey, "00:00", meet.timeZone)
    await prisma.meet.update({
      where: { id: meet.id },
      data: { endsAt: truncated, hasEndTime: false },
    })
    updated += 1
  }

  console.log(`Truncated ${updated} meet(s) with a real end time down to a date-only endsAt.`)
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
