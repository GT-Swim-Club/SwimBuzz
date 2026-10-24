import type { AppRole, StaffTitle } from "./roles"

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
  /** Distinct roster athletes on this meet (sheets + swims), when computed by the server. */
  athleteCount?: number
}

/** TEAM practices follow the publish flow; PRIVATE ones are visible only to their owner. */
export type PracticeVisibility = "TEAM" | "PRIVATE"

/** Which practices a list shows: team + your private ones ("all"), or just one side. */
export type PracticeScope = "all" | "team" | "mine"

export type PracticeSummary = {
  id: string
  slug?: string | null
  title: string
  startsAt: string
  endsAt: string
  timeZone: string
  location: string
  course: string
  focus?: string | null
  tags: string[]
  published: boolean
  visibility: PracticeVisibility
  /** Set only for PRIVATE practices — always the viewer, since nobody else receives them. */
  ownerId?: string | null
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
  preferredName: string | null
  gender: "M" | "F"
  seasons: string[]
  /** Main profile first; up to MAX_SWIMCLOUD_IDS. */
  swimCloudIds: number[]
  /** When SwimCloud times were last imported; null if never. */
  timesSyncedAt?: string | null
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
