const { prisma } = require("./prisma-singleton")

async function cleanupOldNotifications() {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const deleted = await prisma.notification.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    })

    if (deleted.count > 0) {
      console.log(`[Notification Cleanup] Deleted ${deleted.count} old notifications.`)
    }
  } catch (error) {
    console.error("[Notification Cleanup] Error cleaning up notifications:", error)
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const deleted = await prisma.scraperJob.deleteMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        completedAt: { lt: cutoff },
      },
    })
    if (deleted.count > 0) {
      console.log(`[Notification Cleanup] Deleted ${deleted.count} old scraper jobs.`)
    }
  } catch (error) {
    console.error("[Notification Cleanup] Error cleaning scraper jobs:", error)
  }
}

/** Dev-only: production uses Vercel Cron → /api/cron/notification-cleanup */
function startNotificationCleanupMonitor() {
  console.log("[Notification Cleanup] Starting daily cleanup task (dev)")
  cleanupOldNotifications().catch((err) => {
    console.error("[Notification Cleanup] Initial cleanup failed:", err)
  })
  setInterval(() => {
    cleanupOldNotifications().catch((err) => {
      console.error("[Notification Cleanup] Periodic cleanup failed:", err)
    })
  }, 24 * 60 * 60 * 1000)
}

module.exports = { startNotificationCleanupMonitor }
