const { prisma } = require("./prisma-singleton")

const DEFAULT_TIME_ZONE = "America/New_York"

/**
 * Format an instant as "6:00 PM EDT" in `timeZone`. Plain-JS mirror of
 * @swimbuzz/shared's formatZonedInstant/zoneAbbreviation — this file runs directly
 * under `node server.js` (no bundler/ts-node), and @swimbuzz/shared's package.json
 * "main" points at a TypeScript source file that plain `require()` can't load, so we
 * can't import it here and instead keep this small Intl-based helper in sync by hand.
 */
function formatZonedTimeWithAbbrev(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(instant)
  const map = {}
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value
  const time = `${map.hour}:${map.minute} ${map.dayPeriod ?? ""}`.trim()
  return { time, abbrev: map.timeZoneName ?? timeZone }
}

function isSignupWindowOpen(openAt, closeAt, now = new Date()) {
  if (openAt && now < openAt) return false
  if (closeAt && now > closeAt) return false
  return true
}

async function meetHref(meetId) {
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { slug: true },
  })
  return `/meets/${meet?.slug ?? meetId}`
}

async function claimMonitorEvent(meetId, kind, advanceMinutes) {
  try {
    await prisma.meetSignupMonitorEvent.create({
      data: { meetId, kind, advanceMinutes },
    })
    return true
  } catch (err) {
    if (err && err.code === "P2002") return false
    throw err
  }
}

async function notifyMeetSignupOpeningSoon(meetId, meetName, advanceMinutes, openAt, timeZone) {
  try {
    const { NotificationType } = require("@prisma/client")
    const users = await prisma.user.findMany({
      select: { id: true, notificationPreferences: true },
    })
    const recipients = users
      .filter((u) => {
        try {
          const prefs =
            u.notificationPreferences && typeof u.notificationPreferences === "object"
              ? u.notificationPreferences
              : {}
          return (
            Array.isArray(prefs.meetSignupNotificationTimes) &&
            prefs.meetSignupNotificationTimes.includes(advanceMinutes)
          )
        } catch {
          return false
        }
      })
      .map((u) => u.id)

    if (recipients.length === 0) return

    const href = await meetHref(meetId)
    const { time, abbrev } = formatZonedTimeWithAbbrev(openAt, timeZone || DEFAULT_TIME_ZONE)
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: NotificationType.MEET_SIGNUP_OPEN,
        title: `Signup opening soon: ${meetName}`,
        body: `Signup opens in ${advanceMinutes} minute${advanceMinutes === 1 ? "" : "s"}, at ${time} ${abbrev}.`,
        href,
      })),
    })
  } catch (error) {
    console.error("[Signup Monitor] Error sending advance notification:", error)
  }
}

async function notifyMeetSignupOpenNow(meetId, meetName) {
  try {
    const { NotificationType } = require("@prisma/client")
    const users = await prisma.user.findMany({
      select: { id: true, notificationPreferences: true },
    })
    const recipients = users
      .filter((u) => {
        try {
          const prefs =
            u.notificationPreferences && typeof u.notificationPreferences === "object"
              ? u.notificationPreferences
              : {}
          return (
            Array.isArray(prefs.meetSignupNotificationTimes) &&
            prefs.meetSignupNotificationTimes.includes(0)
          )
        } catch {
          return false
        }
      })
      .map((u) => u.id)

    if (recipients.length === 0) return

    const href = await meetHref(meetId)
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: NotificationType.MEET_SIGNUP_OPEN,
        title: `Signup open: ${meetName}`,
        body: "Signup is now open for this meet.",
        href,
      })),
    })
  } catch (error) {
    console.error("[Signup Monitor] Error sending notification:", error)
  }
}

async function checkSignupStatus() {
  const now = new Date()
  const meets = await prisma.meet.findMany({
    where: { signupForm: { isNot: null } },
    select: {
      id: true,
      name: true,
      signupForm: { select: { openAt: true, closeAt: true, timeZone: true } },
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
      if (!meet.signupForm.openAt) {
        await claimMonitorEvent(meet.id, "opened", 0)
        continue
      }
      const claimed = await claimMonitorEvent(meet.id, "opened", 0)
      if (claimed) {
        const ageMs = now.getTime() - meet.signupForm.openAt.getTime()
        if (ageMs >= 0 && ageMs < 90_000) {
          await notifyMeetSignupOpenNow(meet.id, meet.name)
        }
      }
    } else if (meet.signupForm.openAt) {
      const timeUntilOpen = meet.signupForm.openAt.getTime() - now.getTime()
      const advanceMinutes = Math.floor(timeUntilOpen / 60000)
      if (advanceMinutes > 0 && advanceMinutes <= 60) {
        const claimed = await claimMonitorEvent(meet.id, "advance", advanceMinutes)
        if (claimed) {
          await notifyMeetSignupOpeningSoon(
            meet.id,
            meet.name,
            advanceMinutes,
            meet.signupForm.openAt,
            meet.signupForm.timeZone
          )
        }
      }
    }
  }
}

function getMillisecondsUntilNextMinute() {
  const now = new Date()
  return 60000 - (now.getSeconds() * 1000 + now.getMilliseconds())
}

/** Dev-only: production uses external cron → /api/cron/signup-monitor */
function startSignupMonitor() {
  const delayToNextMinute = getMillisecondsUntilNextMinute()
  console.log(
    `[Signup Monitor] Starting in ${Math.round(delayToNextMinute / 1000)}s (dev)`
  )
  setTimeout(() => {
    checkSignupStatus().catch((err) => {
      console.error("[Signup Monitor] Initial check failed:", err)
    })
    setInterval(() => {
      checkSignupStatus().catch((err) => {
        console.error("[Signup Monitor] Periodic check failed:", err)
      })
    }, 60000)
  }, delayToNextMinute)
}

module.exports = { startSignupMonitor, checkSignupStatus }
