import type { ClearanceCheck } from "./clearance"
import type { StaffTitle } from "./roles"

/** One practice check-in, as `/api/practices/[id]/attendance` returns it. */
export type PracticeAttendanceRecord = {
  id: string
  athleteId: string
  athleteSlug: string | null
  name: string
  gender: "M" | "F"
  year: string | null
  /** SCAN = Buzzcard / typed GTID; MANUAL = checked in by name. */
  method: "SCAN" | "MANUAL"
  recordedAt: string
  staffTitle: StaffTitle | null
  /** Staff responses only: clearance checks missing for the practice's season. */
  uncleared?: ClearanceCheck[]
}

export type PracticeAttendanceResponse = {
  attendance: PracticeAttendanceRecord[]
  /** Season the practice falls in. */
  season: string
}

export type PracticeCheckInInput = { athleteId: string } | { gtid: string }

export type PracticeCheckInResponse = {
  duplicate: boolean
  record: PracticeAttendanceRecord
  message?: string
}
