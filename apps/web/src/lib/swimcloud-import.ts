import { normalizeEventName, parseCourse, parseMeetDate, parseSwimTime } from "@/lib/swim-parse"

export type SwimCloudTime = {
  event: string
  course: string
  time: string
  date?: string
  meet?: string
  tags?: string
}

export function swimsFromSwimCloudTimes(
  times: SwimCloudTime[],
  athleteId: string
) {
  const swims: {
    athleteId: string
    event: string
    timeMs: number
    course: ReturnType<typeof parseCourse>
    date: Date
    meet: string | null
    tags: string | null
    source: string
  }[] = []

  for (const swim of times) {
    const timeMs = parseSwimTime(swim.time)
    if (!timeMs) continue

    const date =
      parseMeetDate(swim.date?.trim() ?? "") ??
      (swim.date?.trim() ? new Date(swim.date.trim()) : null)
    if (!date || isNaN(date.getTime())) continue

    swims.push({
      athleteId,
      event: normalizeEventName(swim.event),
      timeMs,
      course: parseCourse(swim.event, swim.course),
      date,
      meet: swim.meet ?? null,
      tags: swim.tags ?? null,
      source: "swimcloud",
    })
  }

  return swims
}
