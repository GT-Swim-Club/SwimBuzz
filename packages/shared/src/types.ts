import type { AppRole } from "./roles"
import type { StaffTitle } from "./staff-roles"

export type SessionUser = {
  id: string
  role: AppRole
  staffTitle?: StaffTitle | null
  name?: string | null
  email?: string | null
  image?: string | null
}

export type MeetSummary = {
  id: string
  slug?: string | null
  name: string
  location?: string | null
  startsAt: string
  endsAt?: string | null
  hasStartTime: boolean
  timeZone: string
  course: string
  season: string
  iconUrl?: string | null
  bannerUrl?: string | null
  _count?: { swims: number }
  /** Distinct roster athletes on this meet (sheets + signups + swims), when computed by the server. */
  athleteCount?: number
}

export type PracticeSummary = {
  id: string
  slug?: string | null
  title: string
  startsAt: string
  endsAt: string
  timeZone: string
  location: string
  focus?: string | null
  tags: string[]
  published: boolean
  sets?: Array<{ distance?: number | null; title?: string | null }>
  _count?: { sets: number }
  /** Sum of set distances, when computed by the server instead of the `sets` array. */
  totalDistance?: number
}

export type AthleteSummary = {
  id: string
  slug?: string | null
  firstName: string
  lastName: string
  nicknames: string[]
  gender: "M" | "F"
  seasons: string[]
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    staffTitle?: StaffTitle | null
  }
}

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  href?: string | null
  athleteId?: string | null
  readAt?: string | null
  createdAt: string
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: SessionUser
}
