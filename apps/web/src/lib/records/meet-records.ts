import type { TeamRecord } from "@prisma/client"
import { formatRecordTime, RECORD_EVENTS, recordSwimmerLabel, type MeetRecord } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { readRecordSwimmers, recordKey } from "@/lib/records/record-rows"

/**
 * GTSC records set at a meet, one per event in records-table order, each with the record it broke.
 * A record a later meet has since broken still counts; one broken twice here shows the faster swim
 * and the record from before this meet.
 */
export async function loadMeetRecords(meetId: string): Promise<MeetRecord[]> {
  const setHere = await prisma.teamRecord.findMany({
    where: { meetId, course: "SCY", dismissed: false },
    select: { gender: true, event: true },
  })
  if (setHere.length === 0) return []

  const keys = [...new Map(setHere.map((r) => [recordKey(r.gender, r.event), r])).values()]
  const rows = await prisma.teamRecord.findMany({
    where: { course: "SCY", dismissed: false, OR: keys.map(({ gender, event }) => ({ gender, event })) },
    orderBy: { createdAt: "asc" },
  })
  const byKey = new Map<string, TeamRecord[]>()
  for (const row of rows) {
    const key = recordKey(row.gender, row.event)
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }

  const out: MeetRecord[] = []
  for (const gender of ["F", "M", "X"] as const) {
    for (const def of RECORD_EVENTS) {
      if (!def.genders.includes(gender)) continue
      const history = byKey.get(recordKey(gender, def.event)) ?? []
      const first = history.findIndex((r) => r.meetId === meetId)
      if (first < 0) continue
      const latest = history.findLast((r) => r.meetId === meetId)!
      const previous = history[first - 1]
      const swimmers = readRecordSwimmers(latest.swimmers).map((s) => s.name)
      const previousHolder = previous && !def.relay ? readRecordSwimmers(previous.swimmers)[0] : undefined
      out.push({
        gender,
        event: def.event,
        swimmers,
        ...(latest.leadoff ? { leadoff: true } : {}),
        time: formatRecordTime(latest.timeMs),
        ...(previous
          ? {
              previous: {
                time: formatRecordTime(previous.timeMs),
                year: previous.year,
                ...(previousHolder?.name ? { holder: recordSwimmerLabel(previous, previousHolder) } : {}),
              },
            }
          : {}),
      })
    }
  }
  return out
}
