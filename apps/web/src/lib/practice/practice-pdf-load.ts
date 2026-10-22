import type { Prisma } from "@prisma/client"
import { zonedDayKey } from "@swimbuzz/shared"
import { practiceSetSelect } from "@/lib/practice/practice-input"
import type { PracticePdfInput } from "@/lib/practice/practice-pdf"

export const practicePdfInclude = {
  sets: { orderBy: { order: "asc" }, select: practiceSetSelect },
} satisfies Prisma.PracticeInclude

type PracticeForPdf = Prisma.PracticeGetPayload<{ include: typeof practicePdfInclude }>

/** Effective start of a practice for exports — falls back to creation time for undated practices. */
export function practicePdfStart(practice: PracticeForPdf): Date {
  return practice.startsAt ?? practice.createdAt
}

export function practicePdfDayKey(practice: PracticeForPdf): string {
  return zonedDayKey(practicePdfStart(practice), practice.timeZone)
}

export function toPracticePdfInput(practice: PracticeForPdf, staff: boolean): PracticePdfInput {
  const startsAt = practicePdfStart(practice)
  const endsAt = practice.endsAt ?? startsAt
  return {
    title: practice.title,
    published: practice.published,
    showDraft: staff,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    timeZone: practice.timeZone,
    location: practice.location,
    course: practice.course,
    focus: practice.focus,
    tags: practice.tags,
    sets: practice.sets.map((set) => ({
      title: set.title,
      content: set.content,
      distance: set.distance,
    })),
    totalDistance: practice.sets.reduce((sum, set) => sum + (set.distance ?? 0), 0),
  }
}
