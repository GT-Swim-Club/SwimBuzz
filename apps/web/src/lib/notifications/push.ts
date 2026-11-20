import { prisma } from "@/lib/prisma"

type PushPayload = { title: string; body: string; href?: string | null }

type ExpoPushMessage = {
  to: string
  title: string
  body?: string
  data?: Record<string, unknown>
  sound?: "default" | null
}

/** One entry per message sent, in order: https://docs.expo.dev/push-notifications/sending-notifications/ */
type ExpoPushTicket = {
  status?: "ok" | "error"
  details?: { error?: string }
}

/**
 * Send Expo push notifications to all registered devices for the given users.
 * Failures are logged and never thrown — in-app notifications remain the source of truth.
 */
export async function sendExpoPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  await sendExpoPushPerUser([...new Set(userIds.filter(Boolean))].map((userId) => ({ userId, ...payload })))
}

/** Like sendExpoPushToUsers, with a payload of its own for each user. */
export async function sendExpoPushPerUser(items: (PushPayload & { userId: string })[]): Promise<void> {
  if (items.length === 0) return
  const byUser = new Map(items.map((item) => [item.userId, item]))

  const devices = await prisma.devicePushToken.findMany({
    where: { userId: { in: [...byUser.keys()] } },
    select: { token: true, userId: true },
  })
  if (devices.length === 0) return

  const messages: ExpoPushMessage[] = devices.map((d) => {
    const payload = byUser.get(d.userId)!
    return {
      to: d.token,
      title: payload.title,
      // A title-only notice ("New Results for …") sends no body line.
      ...(payload.body ? { body: payload.body } : {}),
      sound: "default",
      data: payload.href ? { href: payload.href } : undefined,
    }
  })

  const deadTokens: string[] = []
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
        continue
      }
      const json = (await res.json().catch(() => null)) as { data?: ExpoPushTicket[] } | null
      const tickets = Array.isArray(json?.data) ? json.data : []
      tickets.forEach((ticket, index) => {
        // The app was uninstalled or the token expired: Expo will never deliver to it again.
        if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          deadTokens.push(chunk[index].to)
        }
      })
    } catch (err) {
      console.error("[push] Expo push error", err)
    }
  }

  if (deadTokens.length > 0) {
    await prisma.devicePushToken
      .deleteMany({ where: { token: { in: deadTokens } } })
      .catch((err) => console.error("[push] Failed to prune dead tokens", err))
  }
}
