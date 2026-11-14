import { prisma } from "@/lib/prisma"

/** `Notification.refKey` for notifications about a practice. */
export const practiceRefKey = (practiceId: string) => `practice:${practiceId}`
/** `Notification.refKey` for notifications about a meet; more specific keys add "|…" after it. */
export const meetRefKey = (meetId: string) => `meet:${meetId}`

/** Drop every notification about a practice or meet (it was deleted), so none links to it. */
export async function deleteNotificationsFor(kind: "practice" | "meet", id: string): Promise<void> {
  const key = kind === "practice" ? practiceRefKey(id) : meetRefKey(id)
  try {
    await prisma.notification.deleteMany({
      where: { OR: [{ refKey: key }, { refKey: { startsWith: `${key}|` } }] },
    })
  } catch (err) {
    console.error(`[notifications] Failed to clear notifications for ${key}:`, err)
  }
}
