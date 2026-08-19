const { prisma } = require("./prisma-singleton")

// Mirrors currentStaffTerm() in packages/shared/src/staff-roles.ts — kept in
// sync manually, same pattern as this file's sibling monitors (e.g.
// notification-cleanup-monitor.js duplicates its TS lib for the same reason:
// this CJS process can't import the ESM/TS workspace packages directly).
function currentStaffTerm(date = new Date()) {
  const month = date.getUTCMonth() // 4 = May
  const year = date.getUTCFullYear()
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

async function demoteLapsedStaff() {
  try {
    const term = currentStaffTerm()
    const { count } = await prisma.user.updateMany({
      where: { staffTitle: { not: null }, staffTerm: { not: term } },
      data: { role: "ATHLETE", staffTitle: null, staffTerm: null },
    })
    if (count > 0) {
      console.log(`[Staff Term Expiry] Demoted ${count} lapsed staff account(s).`)
    }
  } catch (error) {
    console.error("[Staff Term Expiry] Error demoting lapsed staff:", error)
  }
}

/** Dev-only: production uses Vercel Cron → /api/cron/staff-term-expiry */
function startStaffTermExpiryMonitor() {
  console.log("[Staff Term Expiry] Starting daily expiry task (dev)")
  demoteLapsedStaff().catch((err) => {
    console.error("[Staff Term Expiry] Initial run failed:", err)
  })
  setInterval(() => {
    demoteLapsedStaff().catch((err) => {
      console.error("[Staff Term Expiry] Periodic run failed:", err)
    })
  }, 24 * 60 * 60 * 1000)
}

module.exports = { startStaffTermExpiryMonitor }
