/** Custom-server scheduler. The shared route owns notification, scraper and recovery cleanup. */
async function cleanup() {
  try {
    const port = parseInt(process.env.PORT ?? "3000", 10)
    const response = await fetch(`http://127.0.0.1:${port}/api/cron/notification-cleanup`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    if (!response.ok) throw new Error(`Cleanup returned ${response.status}`)
    const result = await response.json()
    if (!result.ok) throw new Error("Some recovery files could not be purged; will retry")
  } catch (error) {
    console.error("[Notification Cleanup] Cleanup failed:", error)
  }
}
function startNotificationCleanupMonitor() {
  console.log("[Notification Cleanup] Starting daily cleanup task")
  void cleanup()
  setInterval(() => { void cleanup() }, 24 * 60 * 60 * 1000)
}
module.exports = { startNotificationCleanupMonitor }
