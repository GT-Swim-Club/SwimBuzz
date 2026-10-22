import { NotificationType, Role } from "@prisma/client"
import {
  parseNotificationPreferences,
  type NotificationPreferenceKey,
} from "@/lib/notifications/notification-preferences"
import { collectMeetRosterAthleteIds } from "@/lib/meet/meet-sheet-summary"
import { prisma } from "@/lib/prisma"
import { formatRelativeTime } from "@/lib/utils"
import { formatZonedInstant } from "@swimbuzz/shared"
import { athleteHrefForId, meetHrefForId, practiceHrefForId } from "@/lib/slug"
import { sendExpoPushToUsers } from "@/lib/notifications/push"

async function userIdsWithPreference(
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

export async function notifyPracticePublished(input: {
  practiceId: string
  title: string
  startsAt: Date | null
  timeZone: string
  focus: string | null
  excludeUserId?: string | null
}): Promise<void> {
  const athletes = await prisma.user.findMany({
    where: {
      role: Role.ATHLETE,
      ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
      OR: [{ emailVerified: { not: null } }, { accounts: { some: {} } }],
    },
    select: { id: true, notificationPreferences: true },
  })
  const recipients = athletes
    .filter((u) =>
      parseNotificationPreferences(u.notificationPreferences).practicePublished
    )
    .map((u) => u.id)
  if (recipients.length === 0) return

  const details = [
    input.startsAt ? formatZonedInstant(input.startsAt, input.timeZone).date : null,
    input.focus?.trim() || null,
  ].filter(Boolean)
  const body = details.length > 0 ? details.join(" · ") : "A new practice is available."

  const practiceHref = await practiceHrefForId(input.practiceId)
  const title = `Practice published: ${input.title}`

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.PRACTICE_PUBLISHED,
      title,
      body,
      href: practiceHref,
    })),
  })
  void sendExpoPushToUsers(recipients, { title, body, href: practiceHref })
}

export async function notifyMeetRosterInfoDropped(input: {
  meetId: string
  meetName: string
  infoLabel: string
  body?: string
}): Promise<void> {
  const meet = await prisma.meet.findUnique({
    where: { id: input.meetId },
    select: {
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      swims: { select: { athleteId: true }, distinct: ["athleteId"] },
    },
  })
  if (!meet) return

  const athleteIds = collectMeetRosterAthleteIds({
    psychSheetSummary: meet.psychSheetSummary,
    heatSheetSummary: meet.heatSheetSummary,
    finalsHeatSheetSummary: meet.finalsHeatSheetSummary,
    entriesSheetSummary: meet.entriesSheetSummary,
    relayResultsSummary: meet.relayResultsSummary,
    resultStatusesSummary: meet.resultStatusesSummary,
    swimAthleteIds: meet.swims.map((s) => s.athleteId),
  })
  if (athleteIds.length === 0) return

  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    select: { userId: true },
  })
  const recipients = await userIdsWithPreference(
    athletes.map((a) => a.userId),
    "meetRosterInfo"
  )
  if (recipients.length === 0) return

  const body =
    input.body?.trim() ||
    `New ${input.infoLabel.toLowerCase()} is available for this meet.`

  const meetHref = await meetHrefForId(input.meetId)
  const title = `${input.infoLabel}: ${input.meetName}`

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.MEET_ROSTER_INFO,
      title,
      body,
      href: meetHref,
    })),
  })
  void sendExpoPushToUsers(recipients, { title, body, href: meetHref })
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

  const recipients = await userIdsWithPreference(
    [...candidateIds],
    "practiceComments"
  )
  if (recipients.length === 0) return

  const snippet =
    input.commentBody.length > 120
      ? `${input.commentBody.slice(0, 117)}…`
      : input.commentBody
  const title = input.isReply
    ? `${input.authorName} replied to your comment`
    : `${input.authorName} commented on ${input.practiceTitle}`

  const practiceHref = await practiceHrefForId(input.practiceId)

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.PRACTICE_COMMENT,
      title,
      body: snippet,
      href: practiceHref,
    })),
  })
  void sendExpoPushToUsers(recipients, {
    title,
    body: snippet,
    href: practiceHref,
  })
}

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

export async function notifyTimesImportRequest(input: {
  athleteId: string
  firstName: string
  lastName: string
  swimCloudIds: number[]
  timesSyncedAt: Date | null
}): Promise<void> {
  await dismissTimesImportRequestNotifications(input.athleteId)

  const staff = await prisma.user.findMany({
    where: {
      role: { in: [Role.COACH, Role.EXEC] },
      OR: [{ emailVerified: { not: null } }, { accounts: { some: {} } }],
    },
    select: { id: true, notificationPreferences: true },
  })
  const recipients = staff
    .filter((u) =>
      parseNotificationPreferences(u.notificationPreferences).profileChanges
    )
    .map((u) => u.id)
  if (recipients.length === 0) return

  const ids = `SwimCloud ID${input.swimCloudIds.length > 1 ? "s" : ""} ${input.swimCloudIds.join(", ")}`
  const body = input.timesSyncedAt
    ? `${ids} · last imported ${formatRelativeTime(input.timesSyncedAt)}`
    : `${ids} · never imported`

  const href = await athleteHrefForId(input.athleteId)
  const title = `${input.firstName} ${input.lastName} requested a times import`

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.TIMES_IMPORT_REQUEST,
      title,
      body,
      href,
      athleteId: input.athleteId,
    })),
  })
  void sendExpoPushToUsers(recipients, { title, body, href })
}
