import { NotificationType, Role } from "@prisma/client"
import {
  parseNotificationPreferences,
  preferenceKeyForType,
  type NotificationPreferenceKey,
} from "@/lib/notifications/notification-preferences"
import type { PendingProfileChanges } from "@/lib/athlete/pending-profile-changes"
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

  const title = `${input.firstName} ${input.lastName} requested profile changes`
  const body = describePendingProfileChanges(input.pending)
  const href = await athleteHrefForId(input.athleteId)

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
  void sendExpoPushToUsers(recipients, { title, body, href })
}

export async function notifyAthleteOfProfileChangeDecision(input: {
  userId: string
  approved: boolean
  pending: PendingProfileChanges
}): Promise<void> {
  const allowed = await userIdsWithPreference([input.userId], "profileChanges")
  if (allowed.length === 0) return

  const summary = describePendingProfileChanges(input.pending)
  const title = input.approved
    ? "Profile changes approved"
    : "Profile changes rejected"
  const body = summary
    ? input.approved
      ? `Approved: ${summary}`
      : `Rejected: ${summary}`
    : input.approved
      ? "A coach approved your profile changes."
      : "A coach rejected your profile changes."
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.approved
        ? NotificationType.PROFILE_CHANGE_APPROVED
        : NotificationType.PROFILE_CHANGE_REJECTED,
      title,
      body,
      href: "/settings",
    },
  })
  void sendExpoPushToUsers([input.userId], {
    title,
    body,
    href: "/settings",
  })
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

export async function notifyMeetSignupOpen(input: {
  meetId: string
  meetName: string
}): Promise<void> {
  const athletes = await prisma.user.findMany({
    where: {
      role: Role.ATHLETE,
      OR: [{ emailVerified: { not: null } }, { accounts: { some: {} } }],
    },
    select: { id: true, notificationPreferences: true },
  })
  const recipients = athletes
    .filter((u) =>
      parseNotificationPreferences(u.notificationPreferences).meetSignupOpen
    )
    .map((u) => u.id)
  if (recipients.length === 0) return

  const meetHref = await meetHrefForId(input.meetId)
  const title = `Signup open: ${input.meetName}`
  const body = "Event signup is now open for this meet."

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.MEET_SIGNUP_OPEN,
      title,
      body,
      href: meetHref,
    })),
  })
  void sendExpoPushToUsers(recipients, { title, body, href: meetHref })
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
      signupForm: {
        select: { entries: { select: { athleteId: true } } },
      },
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
    signupAthleteIds: meet.signupForm?.entries.map((e) => e.athleteId) ?? [],
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
  swimCloudId: number
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

  const body = input.timesSyncedAt
    ? `SwimCloud ID ${input.swimCloudId} · last imported ${formatRelativeTime(input.timesSyncedAt)}`
    : `SwimCloud ID ${input.swimCloudId} · never imported`

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
