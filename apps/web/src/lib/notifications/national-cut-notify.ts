import { NotificationType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { canonicalizeStrokeEvent } from "@/lib/swim/swim-parse"
import { isRelayLeadoffSwimTag, isRelaySplitSwimTag } from "@/lib/meet/relay-results"
import { isRelaySignupEvent } from "@/lib/meet/meet-signup"
import { formatDisplayTime, formatTime } from "@/lib/utils"
import { runAfterResponse } from "@/lib/notifications/after-response"
import {
  athleteUserIdsWithPreference,
  deliverNotifications,
  type NotificationDraft,
} from "@/lib/notifications/notifications"
import { meetRefKey } from "@/lib/notifications/notification-refs"

const displayTime = (ms: number) => formatDisplayTime(formatTime(ms))

/**
 * After a meet's results are imported: tell each athlete who made a national cut there in an event
 * they hadn't made it in at any other meet this season (same course as the standards). An athlete
 * is told once per event; re-importing the meet tells no one again. Runs once the response is sent.
 */
export function notifyNewNationalCuts(meetId: string): void {
  runAfterResponse("national cut notification", async () => {
    const meet = await prisma.meet.findUnique({
      where: { id: meetId },
      select: { id: true, name: true, season: true, course: true },
    })
    if (!meet) return
    const set = await prisma.nationalsStandardSet.findUnique({
      where: { season_course: { season: meet.season, course: meet.course } },
      include: { cuts: { where: { isRelay: false } } },
    })
    if (!set || set.cuts.length === 0) return
    const cutByKey = new Map(
      set.cuts.map((c) => [`${c.gender}:${canonicalizeStrokeEvent(c.event).toLowerCase()}`, c])
    )

    const swims = await prisma.swim.findMany({
      where: { meetId: meet.id, course: meet.course },
      select: { athleteId: true, event: true, timeMs: true, tags: true },
      orderBy: { timeMs: "asc" },
    })
    const athletes = new Map(
      (
        await prisma.athlete.findMany({
          where: { id: { in: [...new Set(swims.map((s) => s.athleteId))] }, seasons: { has: meet.season } },
          select: { id: true, gender: true },
        })
      ).map((a) => [a.id, a])
    )

    // Fastest qualifying swim per athlete and event at this meet.
    const made = new Map<string, { athleteId: string; eventKey: string; event: string; timeMs: number; cutMs: number }>()
    for (const swim of swims) {
      const tags = swim.tags ?? ""
      if (isRelayLeadoffSwimTag(tags) || isRelaySplitSwimTag(tags)) continue
      const event = canonicalizeStrokeEvent(swim.event)
      if (!event || isRelaySignupEvent(event)) continue
      const athlete = athletes.get(swim.athleteId)
      if (!athlete) continue
      const eventKey = event.toLowerCase()
      const cut = cutByKey.get(`${athlete.gender}:${eventKey}`)
      if (!cut || swim.timeMs > cut.timeMs) continue
      const key = `${athlete.id}:${eventKey}`
      if (!made.has(key)) {
        made.set(key, { athleteId: athlete.id, eventKey, event: cut.event, timeMs: swim.timeMs, cutMs: cut.timeMs })
      }
    }
    if (made.size === 0) return

    // Drop cuts already made at another meet this season.
    const earlier = await prisma.swim.findMany({
      where: {
        athleteId: { in: [...new Set([...made.values()].map((m) => m.athleteId))] },
        course: meet.course,
        meetId: { not: meet.id },
        meetRef: { is: { season: meet.season } },
      },
      select: { athleteId: true, event: true, timeMs: true, tags: true },
    })
    for (const swim of earlier) {
      const tags = swim.tags ?? ""
      if (isRelayLeadoffSwimTag(tags) || isRelaySplitSwimTag(tags)) continue
      const key = `${swim.athleteId}:${canonicalizeStrokeEvent(swim.event).toLowerCase()}`
      const cut = made.get(key)
      if (cut && swim.timeMs <= cut.cutMs) made.delete(key)
    }
    if (made.size === 0) return

    const recipients = new Map(
      (await athleteUserIdsWithPreference([...made.values()].map((m) => m.athleteId), "nationalCuts")).map(
        (r) => [r.athleteId, r.userId]
      )
    )
    const drafts: NotificationDraft[] = []
    for (const cut of made.values()) {
      const userId = recipients.get(cut.athleteId)
      if (!userId) continue
      const refKey = `${meetRefKey(meet.id)}|nqt|${cut.athleteId}|${cut.eventKey}`
      const already = await prisma.notification.findFirst({
        where: { type: NotificationType.NATIONAL_CUT, refKey },
        select: { id: true },
      })
      if (already) continue
      drafts.push({
        userId,
        type: NotificationType.NATIONAL_CUT,
        title: `National cut: ${cut.event}`,
        body: `${displayTime(cut.timeMs)} at ${meet.name} (cut ${displayTime(cut.cutMs)})`,
        href: "/nationals-qualifiers",
        athleteId: cut.athleteId,
        refKey,
      })
    }
    await deliverNotifications(drafts)
  })
}
