const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

/**
 * Cleanup old notifications to save database space.
 * Deletes all notifications older than 30 days, read or unread.
 */
async function cleanupOldNotifications() {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const deleted = await prisma.notification.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
      },
    })

    if (deleted.count > 0) {
      console.log(`[Notification Cleanup] Deleted ${deleted.count} old notifications.`)
    }
  } catch (error) {
    console.error("[Notification Cleanup] Error cleaning up notifications:", error)
  }
}

/**
 * Start the notification cleanup monitor.
 * Runs once a day.
 */
function startNotificationCleanupMonitor() {
  console.log("[Notification Cleanup] Starting daily cleanup task")
  
  // Run once immediately on startup
  cleanupOldNotifications().catch((err) => {
    console.error("[Notification Cleanup] Initial cleanup failed:", err)
  })

  // Then run every 24 hours
  setInterval(() => {
    cleanupOldNotifications().catch((err) => {
      console.error("[Notification Cleanup] Periodic cleanup failed:", err)
    })
  }, 24 * 60 * 60 * 1000)
}

module.exports = { startNotificationCleanupMonitor }
