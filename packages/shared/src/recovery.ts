const DAY_MS = 86_400_000

/** How long a soft-deleted practice/meet is kept before permanent purge. */
export const RECOVERY_RETENTION_DAYS = 30

export type RecoveryCountdown = {
  label: string
  tone: "normal" | "warning" | "expired"
}

/**
 * Countdown to `purgeAfter`, in whole days. Both web and mobile render through this so the
 * urgency thresholds and copy can't drift between platforms.
 */
export function recoveryCountdown(purgeAfter: string | Date, now: Date = new Date()): RecoveryCountdown {
  const purge = purgeAfter instanceof Date ? purgeAfter : new Date(purgeAfter)
  const diffMs = purge.getTime() - now.getTime()
  if (diffMs <= 0) return { label: "Expired", tone: "expired" }

  const days = Math.floor(diffMs / DAY_MS)
  const tone: RecoveryCountdown["tone"] = days <= 3 ? "warning" : "normal"
  if (days <= 0) return { label: "Expires today", tone }
  if (days === 1) return { label: "Expires tomorrow", tone }
  return { label: `${days} days left`, tone }
}
