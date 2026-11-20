import { NotificationType, Role } from "@prisma/client"
import {
  parseNotificationPreferences,
  type NotificationPreferenceKey,
} from "@/lib/notifications/notification-preferences"
import { prisma } from "@/lib/prisma"
import { formatRelativeTime } from "@/lib/utils"
import { currentSeason, formatZonedInstant, seasonFromDate, zonedDayKey } from "@swimbuzz/shared"
import { athleteHrefForId, meetHrefForId, practiceHrefForId } from "@/lib/slug"
import { sendExpoPushPerUser } from "@/lib/notifications/push"
import { meetAudienceAthleteIds } from "@/lib/notifications/meet-audience"
import { meetRefKey, practiceRefKey } from "@/lib/notifications/notification-refs"

/** One notification for one user; pushed to their devices with the same title, body and link. */
export type NotificationDraft = {
  userId: string
  type: NotificationType
  title: string
  body: string
  href: string | null
  athleteId?: string | null
  refKey?: string | null
}

/** Users (signed in at least once) among `userIds` who keep `key` on. */
export async function userIdsWithPreference(
  userIds: string[],
  key: NotificationPreferenceKey
): Promise<string[]> {
  if (userIds.length === 0) return []
  const users = await prisma.user.findMany({
    where: {
      id: { in: [...new Set(userIds)] },
      OR: [{ emailVerified: { not: null } }, { accounts: { some: {} } }],
    },
    select: { id: true, notificationPreferences: true },
  })
  return users
    .filter((u) => parseNotificationPreferences(u.notificationPreferences)[key])
    .map((u) => u.id)
}

/** Users behind the given athletes who keep `key` on. */
export async function athleteUserIdsWithPreference(
  athleteIds: string[],
  key: NotificationPreferenceKey
): Promise<{ userId: string; athleteId: string }[]> {
  if (athleteIds.length === 0) return []
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: [...new Set(athleteIds)] } },
    select: { id: true, userId: true },
  })
  const allowed = new Set(await userIdsWithPreference(athletes.map((a) => a.userId), key))
  return athletes.filter((a) => allowed.has(a.userId)).map((a) => ({ userId: a.userId, athleteId: a.id }))
}

/** Coaches and exec who keep `key` on. */
export async function staffUserIdsWithPreference(key: NotificationPreferenceKey): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.COACH, Role.EXEC] } },
    select: { id: true },
  })
  return userIdsWithPreference(staff.map((u) => u.id), key)
}

/** Store the notifications and push each to its user's devices. */
export async function deliverNotifications(drafts: NotificationDraft[]): Promise<void> {
  if (drafts.length === 0) return
  await prisma.notification.createMany({
    data: drafts.map((d) => ({
      userId: d.userId,
      type: d.type,
      title: d.title,
      body: d.body,
      href: d.href,
      athleteId: d.athleteId ?? null,
      refKey: d.refKey ?? null,
    })),
  })
  await sendExpoPushPerUser(drafts.map((d) => ({ userId: d.userId, title: d.title, body: d.body, href: d.href })))
}

export async function notifyPracticePublished(input: {
  practiceId: string
  title: string
  startsAt: Date | null
  timeZone: string
  focus: string | null
  excludeUserId?: string | null
}): Promise<void> {
  // Athletes on the practice's season roster (staff who swim included) — not alumni or athletes
  // taken off the season.
  const season = input.startsAt
    ? seasonFromDate(zonedDayKey(input.startsAt, input.timeZone))
    : currentSeason()
  const athletes = await prisma.athlete.findMany({
    where: { seasons: { has: season } },
    select: { userId: true },
  })
  const refKey = practiceRefKey(input.practiceId)
  // Unpublishing and publishing again doesn't announce the practice twice.
  const alreadyTold = new Set(
    (
      await prisma.notification.findMany({
        where: { type: NotificationType.PRACTICE_PUBLISHED, refKey },
        select: { userId: true },
      })
    ).map((n) => n.userId)
  )
  const recipients = (
    await userIdsWithPreference(athletes.map((a) => a.userId), "practicePublished")
  ).filter((id) => id !== input.excludeUserId && !alreadyTold.has(id))
  if (recipients.length === 0) return

  const details = [
    input.startsAt ? formatZonedInstant(input.startsAt, input.timeZone).date : null,
    input.focus?.trim() || null,
  ].filter(Boolean)
  const body = details.length > 0 ? details.join(" · ") : "A new practice is available."
  const href = await practiceHrefForId(input.practiceId)
  const title = `Practice published: ${input.title}`

  await deliverNotifications(
    recipients.map((userId) => ({
      userId,
      type: NotificationType.PRACTICE_PUBLISHED,
      title,
      body,
      href,
      refKey,
    }))
  )
}

/**
 * Something new was posted for a meet: sheets (entries, psych, heat sheets) go out as one notice;
 * the packet, results, live stream and travel info as another — each just a title, "New Results:
 * Iron Goggles Invitational". Both fall under the one Meet Info & Results toggle. Sent to the
 * athletes on the meet (`meetAudienceAthleteIds`).
 */
export async function notifyMeetInfoPosted(input: {
  meetId: string
  meetName: string
  sheetLabels: string[]
  infoLabels: string[]
  excludeUserId?: string | null
}): Promise<void> {
  if (input.sheetLabels.length === 0 && input.infoLabels.length === 0) return
  const athleteIds = await meetAudienceAthleteIds(input.meetId)
  if (athleteIds.length === 0) return
  const href = await meetHrefForId(input.meetId)
  const refKey = meetRefKey(input.meetId)
  const drafts: NotificationDraft[] = []

  const groups = [
    {
      labels: input.sheetLabels,
      key: "meetRosterInfo" as const,
      type: NotificationType.MEET_SHEET_POSTED,
    },
    {
      labels: input.infoLabels,
      key: "meetRosterInfo" as const,
      type: NotificationType.MEET_ROSTER_INFO,
    },
  ]
  for (const group of groups) {
    if (group.labels.length === 0) continue
    const recipients = (await athleteUserIdsWithPreference(athleteIds, group.key)).filter(
      (r) => r.userId !== input.excludeUserId
    )
    const title = `New ${joinLabels(group.labels)}: ${input.meetName}`
    for (const r of recipients) {
      drafts.push({ userId: r.userId, type: group.type, title, body: "", href, refKey })
    }
  }
  await deliverNotifications(drafts)
}

/** "Psych Sheet", "Psych Sheet & Heat Sheet", "Meet Packet, Results & Travel Info". */
function joinLabels(labels: string[]): string {
  const unique = [...new Set(labels)]
  if (unique.length === 1) return unique[0]
  return `${unique.slice(0, -1).join(", ")} & ${unique.at(-1)}`
}

export async function notifyPracticeComment(input: {
  practiceId: string
  practiceTitle: string
  commentBody: string
  authorId: string
  authorName: string
  /** Practice creator — notified for top-level comments. */
  practiceAuthorId: string | null
  /** Parent comment author — notified for replies. */
  parentAuthorId: string | null
  isReply: boolean
}): Promise<void> {
  const candidateIds = new Set<string>()
  if (input.isReply) {
    if (input.parentAuthorId) candidateIds.add(input.parentAuthorId)
  } else if (input.practiceAuthorId) {
    candidateIds.add(input.practiceAuthorId)
  }
  candidateIds.delete(input.authorId)

  const recipients = await userIdsWithPreference([...candidateIds], "practiceComments")
  if (recipients.length === 0) return

  const snippet =
    input.commentBody.length > 120 ? `${input.commentBody.slice(0, 117)}…` : input.commentBody
  const title = input.isReply
    ? `${input.authorName} replied to your comment`
    : `${input.authorName} commented on ${input.practiceTitle}`
  const href = await practiceHrefForId(input.practiceId)

  await deliverNotifications(
    recipients.map((userId) => ({
      userId,
      type: NotificationType.PRACTICE_COMMENT,
      title,
      body: snippet,
      href,
      refKey: practiceRefKey(input.practiceId),
    }))
  )
}

/** Clear staff's "requested a times import" notices for athletes whose times were just imported. */
export async function dismissTimesImportRequestNotifications(
  athleteIds: string | string[]
): Promise<void> {
  const ids = Array.isArray(athleteIds) ? athleteIds : [athleteIds]
  if (ids.length === 0) return
  await prisma.notification.deleteMany({
    where: {
      athleteId: { in: ids },
      type: NotificationType.TIMES_IMPORT_REQUEST,
    },
  })
}

/** How long an athlete waits between times-import requests. */
export const TIMES_IMPORT_REQUEST_COOLDOWN_MS = 12 * 60 * 60 * 1000

/** When the athlete may ask again, or null if they can ask now (no open request in the cooldown). */
export async function timesImportRequestRetryAt(athleteId: string): Promise<Date | null> {
  const latest = await prisma.notification.findFirst({
    where: { athleteId, type: NotificationType.TIMES_IMPORT_REQUEST },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })
  if (!latest) return null
  const retryAt = new Date(latest.createdAt.getTime() + TIMES_IMPORT_REQUEST_COOLDOWN_MS)
  return retryAt.getTime() > Date.now() ? retryAt : null
}

export async function notifyTimesImportRequest(input: {
  athleteId: string
  firstName: string
  lastName: string
  swimCloudIds: number[]
  timesSyncedAt: Date | null
}): Promise<void> {
  await dismissTimesImportRequestNotifications(input.athleteId)

  const recipients = await staffUserIdsWithPreference("profileChanges")
  if (recipients.length === 0) return

  const ids = `SwimCloud ID${input.swimCloudIds.length > 1 ? "s" : ""} ${input.swimCloudIds.join(", ")}`
  const body = input.timesSyncedAt
    ? `${ids} · last imported ${formatRelativeTime(input.timesSyncedAt).replace(/^(Just Now|Yesterday|Tomorrow)/, (w) => w.toLowerCase())}`
    : `${ids} · never imported`
  const href = await athleteHrefForId(input.athleteId)
  const title = `${input.firstName} ${input.lastName} requested a times import`

  await deliverNotifications(
    recipients.map((userId) => ({
      userId,
      type: NotificationType.TIMES_IMPORT_REQUEST,
      title,
      body,
      href,
      athleteId: input.athleteId,
    }))
  )
}
