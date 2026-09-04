import { NotificationType, Prisma } from "@prisma/client"
import { parseNotificationPreferences } from "@/lib/notifications/notification-preferences"
import { prisma } from "@/lib/prisma"
import { meetHrefForId } from "@/lib/slug"
import { sendExpoPushToUsers } from "@/lib/notifications/push"
import { DEFAULT_TIME_ZONE, formatZonedInstant } from "@swimbuzz/shared"

function isSignupWindowOpen(
  openAt: Date | null,
  closeAt: Date | null,
  now = new Date()
) {
  if (openAt && now < openAt) return false
  if (closeAt && now > closeAt) return false
  return true
}

async function claimMonitorEvent(
  meetId: string,
  kind: "opened" | "advance",
  advanceMinutes: number
): Promise<boolean> {
  try {
    await prisma.meetSignupMonitorEvent.create({
      data: { meetId, kind, advanceMinutes },
    })
    return true
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return false
    }
    throw err
  }
}

async function notifyMeetSignupOpeningSoon(
  meetId: string,
  meetName: string,
  advanceMinutes: number,
  openAt: Date,
  timeZone: string
) {
  const users = await prisma.user.findMany({
    select: { id: true, notificationPreferences: true },
  })

  const recipients = users
    .filter((u) => {
      const prefs = parseNotificationPreferences(u.notificationPreferences)
      return (
        prefs.meetSignupOpen &&
        Array.isArray(prefs.meetSignupNotificationTimes) &&
        prefs.meetSignupNotificationTimes.includes(advanceMinutes)
      )
    })
    .map((u) => u.id)

  if (recipients.length === 0) return

  const href = await meetHrefForId(meetId)
  const { time, abbrev } = formatZonedInstant(openAt, timeZone)
  const title = `Signup opening soon: ${meetName}`
  const body = `Signup opens in ${advanceMinutes} minute${advanceMinutes === 1 ? "" : "s"}, at ${time} ${abbrev}.`

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.MEET_SIGNUP_OPEN,
      title,
      body,
      href,
    })),
  })
  void sendExpoPushToUsers(recipients, { title, body, href })
}

async function notifyMeetSignupOpenNow(meetId: string, meetName: string) {
  const users = await prisma.user.findMany({
    select: { id: true, notificationPreferences: true },
  })

  const recipients = users
    .filter((u) => {
      const prefs = parseNotificationPreferences(u.notificationPreferences)
      return (
        prefs.meetSignupOpen &&
        Array.isArray(prefs.meetSignupNotificationTimes) &&
        prefs.meetSignupNotificationTimes.includes(0)
      )
    })
    .map((u) => u.id)

  if (recipients.length === 0) return

  const href = await meetHrefForId(meetId)
  const title = `Signup open: ${meetName}`
  const body = "Signup is now open for this meet."

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.MEET_SIGNUP_OPEN,
      title,
      body,
      href,
    })),
  })
  void sendExpoPushToUsers(recipients, { title, body, href })
}

/**
 * Check meet signup windows and send open / opening-soon notifications.
 * Safe to call every minute from an external cron (idempotent via DB).
 */
export async function checkSignupStatus(): Promise<{
  checked: number
  opened: number
  advance: number
}> {
  const now = new Date()
  let opened = 0
  let advance = 0

  const meets = await prisma.meet.findMany({
    where: { signupForm: { isNot: null } },
    select: {
      id: true,
      name: true,
      signupForm: {
        select: { openAt: true, closeAt: true, timeZone: true },
      },
    },
  })

  for (const meet of meets) {
    if (!meet.signupForm) continue

    const isOpen = isSignupWindowOpen(
      meet.signupForm.openAt,
      meet.signupForm.closeAt,
      now
    )

    if (isOpen) {
      // Always-open forms (no openAt): seed idempotency row, never spam.
      if (!meet.signupForm.openAt) {
        await claimMonitorEvent(meet.id, "opened", 0)
        continue
      }
      const claimed = await claimMonitorEvent(meet.id, "opened", 0)
      if (claimed) {
        const ageMs = now.getTime() - meet.signupForm.openAt.getTime()
        // Only notify near the open transition (~1.5 min), not for long-open meets.
        if (ageMs >= 0 && ageMs < 90_000) {
          await notifyMeetSignupOpenNow(meet.id, meet.name)
          opened += 1
        }
      }
    } else if (meet.signupForm.openAt) {
      const timeUntilOpen = meet.signupForm.openAt.getTime() - now.getTime()
      const advanceMinutes = Math.floor(timeUntilOpen / 60000)

      if (advanceMinutes > 0 && advanceMinutes <= 60) {
        const claimed = await claimMonitorEvent(
          meet.id,
          "advance",
          advanceMinutes
        )
        if (claimed) {
          await notifyMeetSignupOpeningSoon(
            meet.id,
            meet.name,
            advanceMinutes,
            meet.signupForm.openAt,
            meet.signupForm.timeZone ?? DEFAULT_TIME_ZONE
          )
          advance += 1
        }
      }
    }
  }

  return { checked: meets.length, opened, advance }
}
