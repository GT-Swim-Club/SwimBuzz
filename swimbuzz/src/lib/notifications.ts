import { NotificationType, Role } from "@prisma/client"
import {
  parseNotificationPreferences,
  preferenceKeyForType,
  type NotificationPreferenceKey,
} from "@/lib/notification-preferences"
import type { PendingProfileChanges } from "@/lib/pending-profile-changes"
import { prisma } from "@/lib/prisma"
import { formatRelativeTime, formatSwimDate } from "@/lib/utils"

/** How long notifications stay visible before being purged. */
export const NOTIFICATION_RETENTION_DAYS = 30

export function notificationRetentionCutoff(): Date {
  return new Date(
    Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  )
}

export async function purgeExpiredNotifications(userId: string): Promise<void> {
  await prisma.notification.deleteMany({
    where: {
      userId,
      createdAt: { lt: notificationRetentionCutoff() },
    },
  })
}

async function userIdsWithPreference(
  userIds: string[],
  key: NotificationPreferenceKey
): Promise<string[]> {
  if (userIds.length === 0) return []
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    select: { id: true, notificationPreferences: true },
  })
  return users
    .filter((u) => parseNotificationPreferences(u.notificationPreferences)[key])
    .map((u) => u.id)
}

export function describePendingProfileChanges(
  pending: PendingProfileChanges
): string {
  const parts: string[] = []
  if (pending.swimCloudId !== undefined) {
    parts.push(`SwimCloud ID → ${pending.swimCloudId}`)
  }
  if (pending.nicknames !== undefined) {
    parts.push(
      pending.nicknames.length > 0
        ? `Nicknames → ${pending.nicknames.join(", ")}`
        : "Nicknames → (none)"
    )
  }
  return parts.join(" · ")
}

export async function dismissProfileChangeRequestNotifications(
  athleteId: string
): Promise<void> {
  await prisma.notification.deleteMany({
    where: {
      athleteId,
      type: NotificationType.PROFILE_CHANGE_REQUEST,
    },
  })
}

/** Keep request notifications after a decision; mark them resolved so sync won't remove them. */
export async function resolveProfileChangeRequestNotifications(
  athleteId: string,
  approved: boolean
): Promise<void> {
  const existing = await prisma.notification.findMany({
    where: {
      athleteId,
      type: NotificationType.PROFILE_CHANGE_REQUEST,
    },
  })
  if (existing.length === 0) return

  const now = new Date()
  const suffix = approved ? " — approved" : " — rejected"

  await prisma.$transaction(
    existing.map((n) => {
      const alreadyResolved =
        n.title.endsWith(" — approved") || n.title.endsWith(" — rejected")
      return prisma.notification.update({
        where: { id: n.id },
        data: {
          title: alreadyResolved ? n.title : `${n.title}${suffix}`,
          readAt: n.readAt ?? now,
          // Detach so a later cancel/sync does not delete this history entry.
          athleteId: null,
        },
      })
    })
  )
}

export async function syncProfileChangeRequestNotifications(input: {
  athleteId: string
  firstName: string
  lastName: string
  pending: PendingProfileChanges | null
}): Promise<void> {
  await dismissProfileChangeRequestNotifications(input.athleteId)
  if (!input.pending) return

  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.COACH, Role.EXEC] } },
    select: { id: true, notificationPreferences: true },
  })
  const recipients = staff
    .filter((u) =>
      parseNotificationPreferences(u.notificationPreferences).profileChanges
    )
    .map((u) => u.id)
  if (recipients.length === 0) return

  const title = `${input.firstName} ${input.lastName} requested profile changes`
  const body = describePendingProfileChanges(input.pending)
  const href = `/athletes/${input.athleteId}`

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.PROFILE_CHANGE_REQUEST,
      title,
      body,
      href,
      athleteId: input.athleteId,
    })),
  })
}

export async function notifyAthleteOfProfileChangeDecision(input: {
  userId: string
  approved: boolean
  pending: PendingProfileChanges
}): Promise<void> {
  const allowed = await userIdsWithPreference([input.userId], "profileChanges")
  if (allowed.length === 0) return

  const summary = describePendingProfileChanges(input.pending)
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.approved
        ? NotificationType.PROFILE_CHANGE_APPROVED
        : NotificationType.PROFILE_CHANGE_REJECTED,
      title: input.approved
        ? "Profile changes approved"
        : "Profile changes rejected",
      body: summary
        ? input.approved
          ? `Approved: ${summary}`
          : `Rejected: ${summary}`
        : input.approved
          ? "A coach approved your profile changes."
          : "A coach rejected your profile changes.",
      href: "/settings",
    },
  })
}

export async function notifyPracticePublished(input: {
  practiceId: string
  title: string
  date: Date | null
  focus: string | null
  excludeUserId?: string | null
}): Promise<void> {
  const athletes = await prisma.user.findMany({
    where: {
      role: Role.ATHLETE,
      ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
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
    input.date ? formatSwimDate(input.date) : null,
    input.focus?.trim() || null,
  ].filter(Boolean)
  const body = details.length > 0 ? details.join(" · ") : "A new practice is available."

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.PRACTICE_PUBLISHED,
      title: `Practice published: ${input.title}`,
      body,
      href: `/practices/${input.practiceId}`,
    })),
  })
}

export async function notifyMeetSignupOpen(input: {
  meetId: string
  meetName: string
}): Promise<void> {
  const athletes = await prisma.user.findMany({
    where: { role: Role.ATHLETE },
    select: { id: true, notificationPreferences: true },
  })
  const recipients = athletes
    .filter((u) =>
      parseNotificationPreferences(u.notificationPreferences).meetSignupOpen
    )
    .map((u) => u.id)
  if (recipients.length === 0) return

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.MEET_SIGNUP_OPEN,
      title: `Signup open: ${input.meetName}`,
      body: "Event signup is now open for this meet.",
      href: `/meets/${input.meetId}`,
    })),
  })
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
    preferenceKeyForType(NotificationType.PRACTICE_COMMENT)
  )
  if (recipients.length === 0) return

  const snippet =
    input.commentBody.length > 120
      ? `${input.commentBody.slice(0, 117)}…`
      : input.commentBody
  const title = input.isReply
    ? `${input.authorName} replied to your comment`
    : `${input.authorName} commented on ${input.practiceTitle}`

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.PRACTICE_COMMENT,
      title,
      body: snippet,
      href: `/practices/${input.practiceId}`,
    })),
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
  swimCloudId: number
  timesSyncedAt: Date | null
}): Promise<void> {
  await dismissTimesImportRequestNotifications(input.athleteId)

  const staff = await prisma.user.findMany({
    where: { role: { in: [Role.COACH, Role.EXEC] } },
    select: { id: true, notificationPreferences: true },
  })
  const recipients = staff
    .filter((u) =>
      parseNotificationPreferences(u.notificationPreferences).profileChanges
    )
    .map((u) => u.id)
  if (recipients.length === 0) return

  const body = input.timesSyncedAt
    ? `SwimCloud ID ${input.swimCloudId} · last imported ${formatRelativeTime(input.timesSyncedAt)}`
    : `SwimCloud ID ${input.swimCloudId} · never imported`

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.TIMES_IMPORT_REQUEST,
      title: `${input.firstName} ${input.lastName} requested a times import`,
      body,
      href: `/athletes/${input.athleteId}`,
      athleteId: input.athleteId,
    })),
  })
}
