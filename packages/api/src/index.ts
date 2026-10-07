import type {
  AthleteSummary,
  AuthTokens,
  MeetSummary,
  NotificationItem,
  NotificationPreferences,
  PracticeSummary,
  SessionUser,
} from "@swimbuzz/shared"

export type DeletedItem = {
  id: string
  kind: "practice" | "meet"
  name: string
  startsAt: string
  deletedAt: string
  purgeAfter: string
  canRestore: boolean
  deleteSwimsOnPurge: boolean
  timeZone: string
  /** Meet-only display fields (null for practices) — lets the meets Trash render banner cards. */
  endsAt?: string | null
  location?: string | null
  school?: string | null
  bannerUrl?: string | null
  iconUrl?: string | null
}
export type RecentlyDeletedResponse = { items: DeletedItem[] }

export type ApiClientOptions = {
  /** Empty string or undefined → same-origin relative `/api/...` (web). */
  baseUrl?: string
  getAccessToken?: () => Promise<string | null> | string | null
  onUnauthorized?: () => void
}

/**
 * Wire shapes below mirror what the API routes actually read off the
 * request body (see `apps/web/src/lib/practice-input.ts` `buildPracticeData`
 * and `apps/web/src/lib/meet-input.ts` `buildMeetData`), NOT the
 * `PracticeSummary`/`MeetSummary` read shapes — the create/update routes
 * still take a plain-language `date` + `startTime`/`endTime` + `timeZone`
 * (practices) or `startDate`/`endDate` + `startTime` + `timeZone` (meets —
 * no `endTime`; a meet never has a real end time, only an optional end date)
 * and compose `startsAt`/`endsAt` server-side, rather than accepting an
 * instant directly.
 */

export type PracticeSetInput = {
  id?: string
  title?: string | null
  content: string
  distance?: number | null
}

type PracticeWriteFields = {
  title?: string
  /** Date string, e.g. "2026-08-21". */
  date?: string | null
  /** "HH:MM" (24h). */
  startTime?: string
  /** "HH:MM" (24h). */
  endTime?: string
  timeZone?: string
  location?: string
  course?: "SCY" | "LCM" | "SCM"
  focus?: string | null
  tags?: string[]
  published?: boolean
}

/** Both POST /api/practices and PATCH /api/practices/[id] require `sets` (full replace, not a partial diff). */
export type CreatePracticeBody = PracticeWriteFields & {
  sets: PracticeSetInput[]
}

export type UpdatePracticeBody = PracticeWriteFields & {
  sets: PracticeSetInput[]
}

export type HeatSheetLinkInput = {
  url: string
  name?: string
}

export type MeetPhotoLinkInput = {
  url: string
  name?: string
}

export type MeetPhotosInput =
  | MeetPhotoLinkInput[]
  | { links?: MeetPhotoLinkInput[]; previews?: string[] }
  | null

type MeetWriteFields = {
  name?: string
  /** Date string, e.g. "2026-08-21". */
  startDate?: string
  /** Date string, or null to clear. */
  endDate?: string | null
  /** "HH:MM" or "HH:MM:SS", or null to clear. */
  startTime?: string | null
  timeZone?: string
  course?: "SCY" | "LCM" | "SCM"
  /** e.g. "2025-2026". */
  season?: string
  teamCode?: string
  location?: string | null
  school?: string | null
  iconUrl?: string | null
  bannerUrl?: string | null
  packetUrl?: string | null
  psychSheetUrl?: string | null
  heatSheetUrl?: string | null
  heatSheetUrls?: HeatSheetLinkInput[] | null
  finalsHeatSheetUrls?: HeatSheetLinkInput[] | null
  entriesSheetUrl?: string | null
  resultsUrl?: string | null
  swimphoneUrl?: string | null
  liveStreamUrl?: string | null
  rideSignUpsUrl?: string | null
  roomsUrl?: string | null
  hotel?: string | null
  packingList?: string | null
  itinerary?: string | null
  photos?: MeetPhotosInput
}

export type CreateMeetBody = MeetWriteFields & {
  name: string
  startDate: string
}

/** PATCH /api/meets/[id] is a true partial update — only keys present are applied. */
export type UpdateMeetBody = MeetWriteFields & {
  /** Coach-confirmed roster-name -> athleteId mappings from sheet/packet import review. */
  nameMappings?: Record<string, string> | null
  rejectedNames?: string[] | null
  /** Opaque cached sheet-parse payload round-tripped from a prior response; shape owned by meet-sheet-resolve.ts. */
  cachedSheetParses?: unknown
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

    listRecentlyDeleted() {
      return request<RecentlyDeletedResponse>("/api/recently-deleted")
    },
    restoreDeleted(kind: "practice" | "meet", id: string) {
      return request<{ ok: true }>("/api/recently-deleted", { method: "POST", body: JSON.stringify({ kind, id }) })
    },
    purgeDeleted(kind: "practice" | "meet", id: string) {
      return request<{ ok: true }>("/api/recently-deleted", { method: "DELETE", body: JSON.stringify({ kind, id }) })
    },

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

    /** Step 1 of coach/exec sign-in: verify the GT-email OTP, get a short-lived staff-link token for step 2. */
    staffVerify(email: string, code: string) {
      return request<{ staffLinkToken: string } | { error: string }>(
        "/api/auth/mobile/staff/verify",
        {
          method: "POST",
          body: JSON.stringify({ email, code }),
        }
      )
    },

    /**
     * Athlete Google login has no staffLinkToken. Coach/exec sign-in (step 2)
     * passes the token from staffVerify(); the server links the Google
     * account to that roster user and rejects non-@gtswimclub.com addresses.
     */
    mobileGoogleLogin(idToken: string, staffLinkToken?: string) {
      return request<AuthTokens>("/api/auth/mobile/google", {
        method: "POST",
        body: JSON.stringify({ idToken, staffLinkToken }),
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

    createMeet(body: CreateMeetBody) {
      return request<MeetSummary>("/api/meets", {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    updateMeet(id: string, body: UpdateMeetBody) {
      return request<MeetSummary & Record<string, unknown>>(`/api/meets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    },

    deleteMeet(id: string, deleteSwims = false) {
      return request<{ ok: true }>(`/api/meets/${id}`, { method: "DELETE", body: JSON.stringify({ deleteMeet: true, deleteSwims }) })
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

    createPractice(body: CreatePracticeBody) {
      return request<PracticeSummary>("/api/practices", {
        method: "POST",
        body: JSON.stringify(body),
      })
    },

    updatePractice(id: string, body: UpdatePracticeBody) {
      return request<PracticeSummary & Record<string, unknown>>(`/api/practices/${id}`, {
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

    editComment(id: string, body: string) {
      return request(`/api/comments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      })
    },

    deleteComment(id: string) {
      return request(`/api/comments/${id}`, { method: "DELETE" })
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

    /** List a picked spreadsheet's tabs, so the caller can offer a tab chooser when there's more than one. */
    listSheetTabs(input: { accessToken: string; spreadsheetId: string }) {
      return request<{ tabs: Array<{ gid: number; title: string }> }>("/api/roster/import/sheet/tabs", {
        method: "POST",
        body: JSON.stringify(input),
      })
    },

    importRosterFromSheet(input: { accessToken: string; spreadsheetId: string; gid?: number; season: string }) {
      return request<{
        created: number
        updated: number
        parsed: number
        errors: Array<{ row: number; message: string }>
        tab?: string
      }>("/api/roster/import/sheet", {
        method: "POST",
        body: JSON.stringify(input),
      })
    },

    /** Step 1 of the Google Form response import wizard: read a picked sheet's headers/sample rows and a suggested column mapping. */
    previewFormImport(
      meetId: string,
      input: { formType: "signup" | "rooms"; accessToken: string; spreadsheetId: string; gid?: number }
    ) {
      return request(`/api/meets/${meetId}/form-import/preview`, {
        method: "POST",
        body: JSON.stringify(input),
      })
    },

    /** Step 2: preview the outcome of importing with a confirmed column mapping, without writing anything. */
    dryRunFormImport(
      meetId: string,
      input: {
        formType: "signup" | "rooms"
        accessToken: string
        spreadsheetId: string
        gid?: number
        mapping: unknown[]
      }
    ) {
      return request(`/api/meets/${meetId}/form-import/dry-run`, {
        method: "POST",
        body: JSON.stringify(input),
      })
    },

    /** Step 3: commit the import — upserts a sign-up entry or roommate preference per matched row. */
    commitFormImport(
      meetId: string,
      input: {
        formType: "signup" | "rooms"
        accessToken: string
        spreadsheetId: string
        gid?: number
        mapping: unknown[]
        overrides: Record<number, string | null>
      }
    ) {
      return request<{
        created: number
        updated: number
        skipped: number
        warnings: string[]
        errors: Array<{ row: number; message: string }>
      }>(`/api/meets/${meetId}/form-import/commit`, {
        method: "POST",
        body: JSON.stringify(input),
      })
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
