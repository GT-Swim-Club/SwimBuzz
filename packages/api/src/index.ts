import type {
  AthleteSummary,
  AuthTokens,
  MeetSummary,
  NotificationItem,
  NotificationPreferences,
  PracticeSummary,
  SessionUser,
} from "@swimbuzz/shared"

export type ApiClientOptions = {
  /** Empty string or undefined → same-origin relative `/api/...` (web). */
  baseUrl?: string
  getAccessToken?: () => Promise<string | null> | string | null
  onUnauthorized?: () => void
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "ApiError"
    this.body = body
    this.status = status
  }
}

export function createApiClient(options: ApiClientOptions = {}) {
  const base = (options.baseUrl ?? "").replace(/\/$/, "")

  async function request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(init.headers)
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json")
    }
    const token = await options.getAccessToken?.()
    if (token) headers.set("Authorization", `Bearer ${token}`)

    const res = await fetch(`${base}${path}`, { ...init, headers })
    const text = await res.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = text
      }
    }

    if (res.status === 401) options.onUnauthorized?.()
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `Request failed (${res.status})`
      throw new ApiError(msg, res.status, data)
    }
    return data as T
  }

  return {
    request,

    requestEmailCode(email: string) {
      return request<{ ok: true } | { error: string }>("/api/auth/email/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      })
    },

    mobileEmailLogin(email: string, code: string) {
      return request<AuthTokens>("/api/auth/mobile/email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      })
    },

    mobileGoogleLogin(idToken: string) {
      return request<AuthTokens>("/api/auth/mobile/google", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      })
    },

    mobileRefresh(refreshToken: string) {
      return request<AuthTokens>("/api/auth/mobile/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      })
    },

    me() {
      return request<{ user: SessionUser }>("/api/auth/mobile/me")
    },

    listMeets() {
      return request<MeetSummary[]>("/api/meets")
    },

    getMeet(id: string) {
      return request<MeetSummary & Record<string, unknown>>(`/api/meets/${id}`)
    },

    createMeet(body: Record<string, unknown>) {
      return request<MeetSummary>("/api/meets", {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    updateMeet(id: string, body: Record<string, unknown>) {
      return request<MeetSummary & Record<string, unknown>>(`/api/meets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    },

    deleteMeet(id: string) {
      return request<{ ok: true }>(`/api/meets/${id}`, { method: "DELETE" })
    },

    putSignupEntry(
      meetId: string,
      body: {
        events: string[]
        entryTimes?: Record<string, string>
        notes?: string
        answers?: Record<string, string>
      }
    ) {
      return request(`/api/meets/${meetId}/signup/entry`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
    },

    deleteSignupEntry(meetId: string) {
      return request(`/api/meets/${meetId}/signup/entry`, { method: "DELETE" })
    },

    putRoomPreference(
      meetId: string,
      body: {
        preferredAthleteIds: string[]
        excludedAthleteIds: string[]
        notes?: string
        answers?: Record<string, string>
      }
    ) {
      return request(`/api/meets/${meetId}/rooms/preference`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
    },

    deleteRoomPreference(meetId: string) {
      return request(`/api/meets/${meetId}/rooms/preference`, {
        method: "DELETE",
      })
    },

    publishRooms(meetId: string, published: boolean) {
      return request(`/api/meets/${meetId}/rooms/publish`, {
        method: "PATCH",
        body: JSON.stringify({ published }),
      })
    },

    putRoomAssignments(
      meetId: string,
      rooms: Array<{ id?: string; label: string; athleteIds: string[] }>
    ) {
      return request(`/api/meets/${meetId}/rooms/assignments`, {
        method: "PUT",
        body: JSON.stringify({ rooms }),
      })
    },

    listPracticeTags() {
      return request<Array<{ id: string; name: string }>>("/api/practice-tags")
    },

    createPracticeTag(name: string) {
      return request<{ id: string; name: string }>("/api/practice-tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      })
    },

    deletePracticeTag(id: string) {
      return request<{ ok: true }>(`/api/practice-tags/${id}`, {
        method: "DELETE",
      })
    },

    listPractices(params?: { q?: string; tag?: string }) {
      const sp = new URLSearchParams()
      if (params?.q) sp.set("q", params.q)
      if (params?.tag) sp.set("tag", params.tag)
      const qs = sp.toString()
      return request<PracticeSummary[]>(`/api/practices${qs ? `?${qs}` : ""}`)
    },

    getPractice(id: string) {
      return request<PracticeSummary & Record<string, unknown>>(
        `/api/practices/${id}`
      )
    },

    createPractice(body: Record<string, unknown>) {
      return request("/api/practices", {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    updatePractice(id: string, body: Record<string, unknown>) {
      return request(`/api/practices/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    },

    deletePractice(id: string) {
      return request(`/api/practices/${id}`, { method: "DELETE" })
    },

    postPracticeComment(practiceId: string, body: string, parentId?: string) {
      return request(`/api/practices/${practiceId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, parentId }),
      })
    },

    listAthletes() {
      return request<AthleteSummary[]>("/api/athletes")
    },

    getAthlete(id: string) {
      return request<AthleteSummary & Record<string, unknown>>(
        `/api/athletes/${id}`
      )
    },

    createAthlete(body: Record<string, unknown>) {
      return request("/api/athletes", {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    updateAthlete(id: string, body: Record<string, unknown>) {
      return request(`/api/athletes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    },

    deleteAthlete(id: string) {
      return request(`/api/athletes/${id}`, { method: "DELETE" })
    },

    requestTimesImport(athleteId: string) {
      return request(`/api/athletes/${athleteId}/request-times-import`, {
        method: "POST",
      })
    },

    createSwim(body: Record<string, unknown>) {
      return request("/api/swims", {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    deleteSwim(id: string) {
      return request(`/api/swims/${id}`, { method: "DELETE" })
    },

    getQualifiers(params: { season: string; course?: string; gender?: "M" | "F" }) {
      const sp = new URLSearchParams({ season: params.season })
      if (params.course) sp.set("course", params.course)
      if (params.gender) sp.set("gender", params.gender)
      return request<{
        set: Record<string, unknown> | null
        qualifiers?: Array<Record<string, unknown>>
        qualifierCount?: number
        standards?: Array<{ event: string; women: string; men: string }>
      }>(`/api/qualifiers?${sp}`)
    },

    listNotifications() {
      return request<{ notifications: NotificationItem[] }>("/api/notifications")
    },

    markNotificationRead(id: string) {
      return request<{ ok: true }>("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id }),
      })
    },

    markAllNotificationsRead() {
      return request<{ ok: true }>("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ all: true }),
      })
    },

    getViewPreference() {
      return request<{
        defaultView: "gallery" | "list"
        defaultPracticesView: "week" | "month" | "list"
      }>("/api/user/view-preference")
    },

    updateViewPreference(body: {
      defaultView?: "gallery" | "list"
      defaultPracticesView?: "week" | "month" | "list"
    }) {
      return request<{
        success: true
        defaultView: "gallery" | "list"
        defaultPracticesView: "week" | "month" | "list"
      }>("/api/user/view-preference", {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    },

    getNotificationPreferences() {
      return request<{ preferences: NotificationPreferences }>(
        "/api/notifications/preferences"
      )
    },

    updateNotificationPreferences(preferences: Partial<NotificationPreferences>) {
      return request<{ preferences: NotificationPreferences }>(
        "/api/notifications/preferences",
        {
          method: "PATCH",
          body: JSON.stringify(preferences),
        }
      )
    },

    registerPushToken(input: {
      token: string
      platform: "ios" | "android"
      deviceId?: string
    }) {
      return request<{ ok: true }>("/api/devices/push-token", {
        method: "POST",
        body: JSON.stringify(input),
      })
    },

    removePushToken(token: string) {
      return request<{ ok: true }>("/api/devices/push-token", {
        method: "DELETE",
        body: JSON.stringify({ token }),
      })
    },

    listSeasons() {
      return request<string[]>("/api/seasons")
    },

    syncTimes(input: {
      season: string
      athleteIds: string[]
      gender?: "M" | "F" | "all"
    }) {
      return (async () => {
        const enqueued = await request<{
          jobId?: string
          imported?: number
          athletesSynced?: number
          message?: string
          [key: string]: unknown
        }>("/api/times/sync", {
          method: "POST",
          body: JSON.stringify(input),
        })
        if (!enqueued.jobId) return enqueued

        const started = Date.now()
        const timeoutMs = 20 * 60 * 1000
        while (Date.now() - started < timeoutMs) {
          const job = await request<{
            status: string
            error?: string | null
          }>(`/api/scraper/jobs/${enqueued.jobId}`)
          if (job.status === "FAILED") {
            throw new ApiError(job.error ?? "Run scraper failed", 502, job)
          }
          if (job.status === "COMPLETED") break
          await new Promise((r) => setTimeout(r, 1500))
        }

        return request("/api/times/sync/finalize", {
          method: "POST",
          body: JSON.stringify({ jobId: enqueued.jobId }),
        })
      })()
    },

    optimalRelays(body: {
      relayEvent: string
      course?: string
      gender?: string
      relayCount?: number
      athleteIds?: string[]
      lockedSwimmerIds?: string[]
      withinDays?: number | null
    }) {
      return request<{ teams?: Array<Record<string, unknown>> } & Record<string, unknown>>(
        "/api/relays/optimal",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      )
    },

    saveRelayTeam(meetId: string, body: Record<string, unknown>) {
      return request(`/api/meets/${meetId}/relays`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    deleteRelayTeam(meetId: string, body: Record<string, unknown>) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(body)) {
        if (value != null && String(value).trim()) {
          params.set(key, String(value))
        }
      }
      return request(`/api/meets/${meetId}/relays?${params.toString()}`, {
        method: "DELETE",
      })
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
