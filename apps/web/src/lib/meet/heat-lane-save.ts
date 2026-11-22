import { HEAT_LANE_LOCKS_AFTER_MEET, meetHasEnded } from "@swimbuzz/shared"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  isHeatLaneOverridesSummary,
  parseSetHeatLaneInput,
  upsertHeatLaneOverride,
} from "@/lib/meet/heat-lane-overrides"

/** Save a row's coach heat & lane on the meet (shared by the API route and the web action). */
export async function saveMeetHeatLane(meetId: string, raw: unknown): Promise<void> {
  const override = parseSetHeatLaneInput(raw)
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: { heatLaneOverrides: true, startsAt: true, endsAt: true, timeZone: true },
  })
  if (!meet) throw new Error("Meet not found")
  if (HEAT_LANE_LOCKS_AFTER_MEET && meetHasEnded(meet)) throw new Error("This meet is over, so its heat & lane can't be changed")
  const existing = isHeatLaneOverridesSummary(meet.heatLaneOverrides) ? meet.heatLaneOverrides.entries : []
  const entries = upsertHeatLaneOverride(existing, override)
  await prisma.meet.update({
    where: { id: meetId },
    data: { heatLaneOverrides: { entries } as unknown as Prisma.InputJsonValue },
  })
}
