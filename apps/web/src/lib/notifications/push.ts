import { prisma } from "@/lib/prisma"

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: "default" | null
}

/**
 * Send Expo push notifications to all registered devices for the given users.
 * Failures are logged and never thrown — in-app notifications remain the source of truth.
 */
export async function sendExpoPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; href?: string | null }
): Promise<void> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return

  const devices = await prisma.devicePushToken.findMany({
    where: { userId: { in: uniqueIds } },
    select: { token: true },
  })
  if (devices.length === 0) return

  const messages: ExpoPushMessage[] = devices.map((d) => ({
    to: d.token,
    title: payload.title,
    body: payload.body,
    sound: "default",
    data: payload.href ? { href: payload.href } : undefined,
  }))

  // Expo accepts batches of up to 100.
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      }
      if (process.env.EXPO_ACCESS_TOKEN) {
        headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`
      }
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        body: JSON.stringify(chunk),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        console.error("[push] Expo push failed", res.status, text)
      }
    } catch (err) {
      console.error("[push] Expo push error", err)
    }
  }
}
