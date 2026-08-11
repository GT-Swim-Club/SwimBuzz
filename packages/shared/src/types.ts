import type { AppRole } from "./roles"

export type SessionUser = {
  id: string
  role: AppRole
  name?: string | null
  email?: string | null
  image?: string | null
}

export type MeetSummary = {
  id: string
  slug?: string | null
  name: string
  location?: string | null
  startDate: string
  endDate?: string | null
  course: string
  season: string
  iconUrl?: string | null
  bannerUrl?: string | null
  _count?: { swims: number }
}

export type PracticeSummary = {
  id: string
  slug?: string | null
  title: string
  date?: string | null
  startTime: string
  endTime: string
  location: string
  focus?: string | null
  tags: string[]
  published: boolean
  _count?: { sets: number }
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
