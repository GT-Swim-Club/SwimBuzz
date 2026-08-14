import { notifyMeetRosterInfoDropped } from "@/lib/notifications"

export const MEET_INFO_LABELS = {
  psych_sheet: "Psych sheet",
  heat_sheet: "Heat sheet",
  finals_heat_sheet: "Finals heat sheet",
  entries_sheet: "Entries sheet",
  packet: "Meet packet",
  results: "Results",
  live_stream: "Live stream",
  travel: "Travel info",
} as const

export type MeetInfoDropKind = keyof typeof MEET_INFO_LABELS

type MeetResourceSnapshot = {
  packetUrl: string | null
  resultsUrl: string | null
  swimphoneUrl: string | null
  liveStreamUrl: string | null
  rideSignUpsUrl: string | null
  roomsUrl: string | null
  hotel: string | null
  packingList: string | null
  itinerary: string | null
}

const TRAVEL_KEYS = [
  "rideSignUpsUrl",
  "roomsUrl",
  "hotel",
  "packingList",
  "itinerary",
] as const satisfies readonly (keyof MeetResourceSnapshot)[]

export function detectMeetResourceDrops(
  existing: MeetResourceSnapshot,
  data: Record<string, unknown>,
  opts?: { packetParsed?: boolean }
): MeetInfoDropKind[] {
  const drops: MeetInfoDropKind[] = []

  if (opts?.packetParsed) {
    drops.push("packet")
  } else if ("packetUrl" in data) {
    const next = (data.packetUrl as string | null) ?? null
    if (next && next !== existing.packetUrl) drops.push("packet")
  }

  if ("resultsUrl" in data) {
    const next = (data.resultsUrl as string | null) ?? null
    if (next && next !== existing.resultsUrl) drops.push("results")
  }
  if ("swimphoneUrl" in data) {
    const next = (data.swimphoneUrl as string | null) ?? null
    if (next && next !== existing.swimphoneUrl) drops.push("results")
  }


  if ("liveStreamUrl" in data) {
    const next = (data.liveStreamUrl as string | null) ?? null
    if (next && next !== existing.liveStreamUrl) drops.push("live_stream")
  }

  let travelChanged = false
  for (const key of TRAVEL_KEYS) {
    if (!(key in data)) continue
    const next = (data[key] as string | null) ?? null
    if (next && next !== existing[key]) {
      travelChanged = true
      break
    }
  }
  if (travelChanged) drops.push("travel")

  return drops
}

export function meetInfoLabel(kind: MeetInfoDropKind): string {
  return MEET_INFO_LABELS[kind]
}

export async function notifyMeetRosterOfInfoDrops(input: {
  meetId: string
  meetName: string
  drops: MeetInfoDropKind[]
}): Promise<void> {
  const uniqueDrops = [...new Set(input.drops)]
  if (uniqueDrops.length === 0) return

  await Promise.all(
    uniqueDrops.map(async (kind) => {
      try {
        await notifyMeetRosterInfoDropped({
          meetId: input.meetId,
          meetName: input.meetName,
          infoLabel: meetInfoLabel(kind),
        })
      } catch (err) {
        console.error(`Meet roster notification failed (${kind}):`, err)
      }
    })
  )
}
