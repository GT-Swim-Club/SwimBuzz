import { Course } from "@prisma/client"

const COURSES: Course[] = [Course.SCY, Course.LCM, Course.SCM]

/** Parses a client-supplied course value, defaulting to SCY for anything unrecognized. */
export function parseCourse(value: unknown): Course {
  const upper = String(value ?? "").toUpperCase()
  return COURSES.find((c) => c === upper) ?? Course.SCY
}
