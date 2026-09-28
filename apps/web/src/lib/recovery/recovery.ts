import { prisma } from "@/lib/prisma"
import { withDeleted } from "../../../soft-delete-policy"
import { deleteAllMeetFiles } from "@/lib/meet/meet-storage"
import { RECOVERY_RETENTION_DAYS } from "@swimbuzz/shared"

export type RecoveryKind = "practice" | "meet"
const DAY = 86_400_000
function deletionDates() {
  const deletedAt = new Date()
  return { deletedAt, purgeAfter: new Date(deletedAt.getTime() + RECOVERY_RETENTION_DAYS * DAY) }
}
export async function softDeletePractice(id: string) {
  const dates = deletionDates()
  return prisma.practice.update({ where: { id }, data: {
    ...dates, editLockedById: null, editLockedAt: null, editLockExpiresAt: null, editLockToken: null,
  } })
}
export async function softDeleteMeet(id: string, deleteSwims: boolean) {
  const dates = deletionDates()
  return prisma.meet.update({ where: { id }, data: { ...dates, deleteSwimsOnPurge: deleteSwims } })
}
export async function listRecentlyDeleted() {
  return withDeleted(async () => {
    const where = { deletedAt: { not: null } }
    const [practices, meets] = await Promise.all([
      prisma.practice.findMany({ where, select: { id: true, title: true, startsAt: true, deletedAt: true, purgeAfter: true, purgeStartedAt: true, timeZone: true }, orderBy: { deletedAt: "desc" } }),
      prisma.meet.findMany({ where, select: { id: true, name: true, startsAt: true, deletedAt: true, purgeAfter: true, purgeStartedAt: true, deleteSwimsOnPurge: true, timeZone: true }, orderBy: { deletedAt: "desc" } }),
    ])
    const now = Date.now()
    const items = [
      ...practices.map(p => ({ ...p, kind: "practice" as const, name: p.title, deleteSwimsOnPurge: false })),
      ...meets.map(m => ({ ...m, kind: "meet" as const })),
    ].map(item => ({
      id: item.id, kind: item.kind, name: item.name, startsAt: item.startsAt.toISOString(),
      deletedAt: item.deletedAt!.toISOString(), purgeAfter: item.purgeAfter!.toISOString(),
      canRestore: !item.purgeStartedAt && item.purgeAfter!.getTime() > now,
      deleteSwimsOnPurge: item.deleteSwimsOnPurge, timeZone: item.timeZone,
    })).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
    return { items }
  })
}
export async function restoreDeleted(kind: RecoveryKind, id: string) {
  return withDeleted(async () => {
    // The conditional UPDATE takes a row lock: only restore or purge can win.
    const where = { id, deletedAt: { not: null }, purgeAfter: { gt: new Date() }, purgeStartedAt: null }
    const data = { deletedAt: null, purgeAfter: null }
    const result = kind === "practice"
      ? await prisma.practice.updateMany({ where, data })
      : await prisma.meet.updateMany({ where, data: { ...data, deleteSwimsOnPurge: false } })
    return result.count === 1
  })
}
async function purgeMeet(meet: Parameters<typeof deleteAllMeetFiles>[0] & { id: string }) {
  await deleteAllMeetFiles(meet, { strict: true })
  await prisma.$transaction(async tx => {
    // Recheck the tombstone inside the transaction before deleting swims.
    const pending = await tx.meet.findFirst({ where: { id: meet.id, deletedAt: { not: null }, purgeStartedAt: { not: null } } })
    if (!pending) return
    if (pending.deleteSwimsOnPurge) await tx.swim.deleteMany({ where: { meetId: meet.id } })
    await tx.meet.delete({ where: { id: meet.id } })
  })
}
export async function purgeDeletedNow(kind: RecoveryKind, id: string) {
  return withDeleted(async () => {
    if (kind === "practice") {
      const result = await prisma.practice.deleteMany({ where: { id, deletedAt: { not: null } } })
      return result.count === 1
    }
    const claimed = await prisma.meet.updateMany({ where: { id, deletedAt: { not: null }, purgeStartedAt: null }, data: { purgeStartedAt: new Date() } })
    if (!claimed.count) return false
    const meet = await prisma.meet.findUnique({ where: { id } })
    if (!meet) return false
    await purgeMeet(meet)
    return true
  })
}
export async function purgeRecentlyDeleted() {
  return withDeleted(async () => {
    const where = { deletedAt: { not: null }, purgeAfter: { lte: new Date() } }
    const practices = await prisma.practice.deleteMany({ where })
    // Bound each run; failures retain the meet and URLs for the next retry.
    const meets = await prisma.meet.findMany({ where, orderBy: { purgeAfter: "asc" }, take: 25 })
    let purgedMeets = 0
    let failedMeets = 0
    for (const meet of meets) {
      const claimed = await prisma.meet.updateMany({ where: { ...where, id: meet.id }, data: { purgeStartedAt: new Date() } })
      if (!claimed.count) continue
      try {
        await purgeMeet(meet)
        purgedMeets++
      } catch (error) {
        failedMeets++
        console.error("[recovery] Meet purge failed", meet.id, error)
      }
    }
    return { practices: practices.count, meets: purgedMeets, failedMeets }
  })
}
