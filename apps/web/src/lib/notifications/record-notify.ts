import { NotificationType, type RecordGender } from "@prisma/client"
import { recordSwimmerName, recordTimeLabel, type TeamRecordSwimmer } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { runAfterResponse } from "@/lib/notifications/after-response"
import {
  athleteUserIdsWithPreference,
  deliverNotifications,
  staffUserIdsWithPreference,
  type NotificationDraft,
} from "@/lib/notifications/notifications"
import { meetRefKey } from "@/lib/notifications/notification-refs"

/** A record the sync just set from an imported swim or relay. */
export type NewTeamRecord = {
  gender: RecordGender
  event: string
  timeMs: number
  date: Date
  swimmers: TeamRecordSwimmer[]
  leadoff: boolean
  meetId: string
  meetName: string
}

/**
 * Only records swum lately are news: a sync that promotes an old swim (a backfill, a meet imported
 * long after, a record falling back when a newer one is deleted) stays quiet.
 */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000

const GENDER_LABELS: Record<RecordGender, string> = { F: "Women's", M: "Men's", X: "Mixed" }

/** Tell the new holders and staff about records just set. Runs once the response is sent. */
export function notifyTeamRecordsBroken(records: NewTeamRecord[]): void {
  const recent = records.filter((r) => Date.now() - r.date.getTime() <= RECENT_MS)
  if (recent.length === 0) return
  runAfterResponse("team record notification", async () => {
    const staff = await staffUserIdsWithPreference("teamRecords")
    const drafts: NotificationDraft[] = []
    for (const record of recent) {
      // The meet's key first, so the notice goes when its meet is deleted.
      const refKey = `${meetRefKey(record.meetId)}|record|${record.gender}|${record.event}|${record.timeMs}`
      const told = new Set(
        (
          await prisma.notification.findMany({
            where: { type: NotificationType.TEAM_RECORD, refKey },
            select: { userId: true },
          })
        ).map((n) => n.userId)
      )
      const holderIds = record.swimmers.map((s) => s.athleteId).filter((id): id is string => Boolean(id))
      const holders = await athleteUserIdsWithPreference(holderIds, "teamRecords")
      const holderUserIds = new Set(holders.map((h) => h.userId))

      const eventLabel = `${GENDER_LABELS[record.gender]} ${record.event}`
      const names = record.swimmers.map(recordSwimmerName).join(", ")
      const body = `${names} · ${recordTimeLabel(record)} · ${record.meetName}`
      const base = { type: NotificationType.TEAM_RECORD, body, href: "/records", refKey }

      for (const userId of holderUserIds) {
        if (told.has(userId)) continue
        drafts.push({ ...base, userId, title: `You set the team record in the ${eventLabel}` })
      }
      for (const userId of staff) {
        if (told.has(userId) || holderUserIds.has(userId)) continue
        drafts.push({ ...base, userId, title: `New team record: ${eventLabel}` })
      }
    }
    await deliverNotifications(drafts)
  })
}
