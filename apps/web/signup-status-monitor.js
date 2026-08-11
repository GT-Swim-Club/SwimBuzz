const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

// Track the state of each meet's signup window
const meetSignupState = new Map()

// Track which advance notifications have been sent to avoid duplicates
// Key: `${meetId}:${advanceMinutes}`, Value: timestamp of when sent
const advanceNotificationsSent = new Map()

// Track if a check is currently running to prevent overlaps
let isChecking = false

/**
 * Check if a signup window is currently open.
 * Mirrors the logic from signupWindowStatus in src/lib/meet-signup.ts
 */
function isSignupWindowOpen(openAt, closeAt, now = new Date()) {
  if (openAt && now < openAt) {
    return false
  }
  if (closeAt && now > closeAt) {
    return false
  }
  return true
}

async function meetHref(meetId) {
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { slug: true },
  })
  return `/meets/${meet?.slug ?? meetId}`
}

/**
 * Send advance notification when signups are opening soon.
 */
async function notifyMeetSignupOpeningSoon(meetId, meetName, advanceMinutes) {
  try {
    const { NotificationType } = require("@prisma/client")

    const users = await prisma.user.findMany({
      select: { id: true, notificationPreferences: true },
    })

    // Filter users who have meetSignupOpen enabled and have the advance minutes set
    const recipients = users
      .filter((u) => {
        try {
          const prefs =
            u.notificationPreferences && typeof u.notificationPreferences === "object"
              ? u.notificationPreferences
              : {}
          // User must have meetSignupOpen enabled and their notification times must include advanceMinutes
          return (
            Array.isArray(prefs.meetSignupNotificationTimes) &&
            prefs.meetSignupNotificationTimes.includes(advanceMinutes)
          )
        } catch {
          return false
        }
      })
      .map((u) => u.id)

    if (recipients.length === 0) {
      return
    }

    const href = await meetHref(meetId)

    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: NotificationType.MEET_SIGNUP_OPEN,
        title: `Signup opening soon: ${meetName}`,
        body: `Signup will open in ${advanceMinutes} minute${advanceMinutes === 1 ? "" : "s"}.`,
        href,
      })),
    })

    console.log(
      `[Signup Monitor] Sent ${advanceMinutes}-minute advance notifications to ${recipients.length} user(s) for "${meetName}"`
    )
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
          console.log(`[Signup Monitor] Checking user ${u.id}, prefs:`, u.notificationPreferences)
          const prefs =
            u.notificationPreferences && typeof u.notificationPreferences === "object"
              ? u.notificationPreferences
              : {}
          // Send now if they have "0" in their notification times
          const isEnabled = Array.isArray(prefs.meetSignupNotificationTimes) &&
            prefs.meetSignupNotificationTimes.includes(0)
          console.log(`[Signup Monitor] User ${u.id} enabled:`, isEnabled)
          return isEnabled
        } catch (e) {
          console.error(`[Signup Monitor] Error checking user ${u.id}:`, e)
          return false
        }
      })
      .map((u) => u.id)

    if (recipients.length === 0) {
      console.log(`[Signup Monitor] No users with "0" notification time for "${meetName}"`)
      return
    }

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

    console.log(
      `[Signup Monitor] Sent notifications to ${recipients.length} user(s) for "${meetName}"`
    )
  } catch (error) {
    console.error("[Signup Monitor] Error sending notification:", error)
  }
}

/**
 * Check all meets with signup forms and detect state transitions.
 * Sends notifications when signups open.
 */
async function checkSignupStatus() {
  console.log("[Signup Monitor] Checking signup status...")
  if (isChecking) {
    console.log("[Signup Monitor] Check already in progress, skipping")
    return
  }

  isChecking = true

  try {
    const now = new Date()

    // Find all meets with signup forms
    const meets = await prisma.meet.findMany({
      where: {
        signupForm: {
          isNot: null,
        },
      },
      select: {
        id: true,
        name: true,
        signupForm: {
          select: {
            openAt: true,
            closeAt: true,
          },
        },
      },
    })

    for (const meet of meets) {
      if (!meet.signupForm) continue

      const now = new Date()

      // Track if signup is currently open
      const isOpen = isSignupWindowOpen(
        meet.signupForm.openAt,
        meet.signupForm.closeAt,
        now
      )

      const previousState = meetSignupState.get(meet.id)

      // Detect transition from closed to open
      if (isOpen && previousState === false) {
        console.log(`[Signup Monitor] Meet "${meet.name}" (${meet.id}) signups OPENED`)
        
        // Use existing notifyMeetSignupOpen function (renaming to notifyMeetSignupOpen in this scope if needed)
        // Note: The previous notifyMeetSignupOpen function is now named incorrectly, 
        // will rename in next step.
        // For now, I'll update the function signature.
        await notifyMeetSignupOpenNow(meet.id, meet.name)
      }

      // Detect transition from open to closed
      if (!isOpen && previousState === true) {
        console.log(`[Signup Monitor] Meet "${meet.name}" (${meet.id}) signups CLOSED`)
      }

      // Check for upcoming openings
      if (!isOpen && meet.signupForm.openAt) {
        const timeUntilOpen = meet.signupForm.openAt.getTime() - now.getTime()
        const advanceMinutes = Math.floor(timeUntilOpen / 60000)

        // If openAt is in the near future (e.g., within 60 mins), check if notification needed
        // Only trigger advance notifications for > 0 minutes to avoid colliding with "open now" notifications
        if (advanceMinutes > 0 && advanceMinutes <= 60) {
          const notificationKey = `${meet.id}:${advanceMinutes}`
          
          // Only notify if we haven't already sent for this exact minute match
          if (!advanceNotificationsSent.has(notificationKey)) {
            await notifyMeetSignupOpeningSoon(meet.id, meet.name, advanceMinutes)
            advanceNotificationsSent.set(notificationKey, now)
          }
        }
      }

      // Clear notifications sent for past meet
      if (isOpen) {
        // Cleanup sent notifications for this meet
        for (const key of advanceNotificationsSent.keys()) {
          if (key.startsWith(`${meet.id}:`)) {
            advanceNotificationsSent.delete(key)
          }
        }
      }

      // Update tracked state
      meetSignupState.set(meet.id, isOpen)
    }

  } catch (error) {
    console.error("[Signup Monitor] Error checking signup status:", error)
  } finally {
    isChecking = false
  }
}

/**
 * Calculate milliseconds until the next minute boundary (:00 seconds).
 */
function getMillisecondsUntilNextMinute() {
  const now = new Date()
  const secondsElapsed = now.getSeconds()
  const millisecondsElapsed = now.getMilliseconds()
  const totalElapsedMs = secondsElapsed * 1000 + millisecondsElapsed
  return 60000 - totalElapsedMs
}

/**
 * Start the signup status monitor.
 * Runs the first check at the next minute boundary, then every minute thereafter.
 */
function startSignupMonitor() {
  const delayToNextMinute = getMillisecondsUntilNextMinute()

  console.log(
    `[Signup Monitor] Starting in ${Math.round(delayToNextMinute / 1000)}s (at next minute boundary)`
  )

  // Schedule first check at the next minute boundary
  setTimeout(() => {
    console.log("[Signup Monitor] Running initial check at minute boundary")
    checkSignupStatus().catch((err) => {
      console.error("[Signup Monitor] Initial check failed:", err)
    })

    // Then run every 60 seconds (which will stay aligned to minute boundaries)
    setInterval(() => {
      checkSignupStatus().catch((err) => {
        console.error("[Signup Monitor] Periodic check failed:", err)
      })
    }, 60000)
  }, delayToNextMinute)
}

module.exports = { startSignupMonitor }
