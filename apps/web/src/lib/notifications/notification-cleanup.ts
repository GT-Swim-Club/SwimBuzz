import { prisma } from "@/lib/prisma"

/**
 * Delete notifications older than 30 days (read or unread).
 */
export async function cleanupOldNotifications(): Promise<{ deleted: number }> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const deleted = await prisma.notification.deleteMany({
    where: {
      createdAt: { lt: thirtyDaysAgo },
    },
  })

  return { deleted: deleted.count }
}

/** Delete finished scraper jobs older than `maxAgeMs` (default 24h). */
export async function cleanupOldScraperJobs(
  maxAgeMs = 24 * 60 * 60 * 1000
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - maxAgeMs)
  const deleted = await prisma.scraperJob.deleteMany({
    where: {
      status: { in: ["COMPLETED", "FAILED"] },
      completedAt: { lt: cutoff },
    },
  })
  return { deleted: deleted.count }
}
