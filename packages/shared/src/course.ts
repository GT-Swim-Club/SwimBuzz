export const COURSES = ["SCY", "LCM", "SCM"] as const

export type CourseCode = (typeof COURSES)[number]

export const COURSE_LABELS: Record<CourseCode, string> = {
  SCY: "Short course yards",
  SCM: "Short course meters",
  LCM: "Long course meters",
}

/** "2000 SCY" — falls back to SCY when a practice predates the `course` field. */
export function formatPracticeDistance(distance: number, course?: string | null): string {
  return `${distance} ${course || "SCY"}`
}
