export const MEET_FILE_BUCKET = "meet-files"

/**
 * Folders inside the meet-files bucket. Each meet's uploads live in
 * `meets/<meetId>/`: keyed by id rather than slug because the slug changes when
 * a meet is renamed, which would leave a folder named after the old name (or
 * force moving every file and rewriting every URL on each rename). Files from
 * before folders existed stay readable at their flat `uploads/…` URLs until
 * `scripts/migrate-meet-files.mjs` moves them.
 */
export const MEET_FOLDER_ROOT = "meets"
/** Uploads made before their meet exists (the create-meet form); moved into the meet's folder on create. */
export const PENDING_MEET_FILE_FOLDER = "pending"
/** Copies made only so the PDF parser can fetch a file; deleted once the parse finishes. */
export const PARSE_TMP_FOLDER = "parse-tmp"
/** Uploaded Nationals standards PDFs (not tied to a meet). */
export const NATIONALS_FILE_FOLDER = "nationals"

export function meetFileFolder(meetId: string): string {
  return `${MEET_FOLDER_ROOT}/${meetId}`
}

export const MEET_RESOURCE_URL_KEYS = [
  "packetUrl",
  "entriesSheetUrl",
  "psychSheetUrl",
  "heatSheetUrl",
  "resultsUrl",
] as const

export const MEET_TRAVEL_URL_KEYS = [
  "rideSignUpsUrl",
  "roomsUrl",
] as const

export const MEET_FILE_URL_KEYS = [
  ...MEET_RESOURCE_URL_KEYS,
  ...MEET_TRAVEL_URL_KEYS,
] as const

export type MeetResourceUrlKey = (typeof MEET_RESOURCE_URL_KEYS)[number]
export type MeetTravelUrlKey = (typeof MEET_TRAVEL_URL_KEYS)[number]
export type MeetFileUrlKey = (typeof MEET_FILE_URL_KEYS)[number]

export type HeatSheetLink = {
  url: string
  name?: string
}

/** Kept as an alias so finals callers retain their established contract. */
export type FinalsHeatSheetLink = HeatSheetLink

export function normalizeHeatSheetUrls(value: unknown): HeatSheetLink[] | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) return null
  const links: HeatSheetLink[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const url = String((item as { url?: unknown }).url ?? "").trim()
    if (!url) continue
    const nameRaw = (item as { name?: unknown }).name
    const name =
      nameRaw === undefined || nameRaw === null
        ? undefined
        : String(nameRaw).trim() || undefined
    links.push(name ? { url, name } : { url })
  }
  return links.length > 0 ? links.slice(0, 20) : null
}

export function heatSheetUrlList(value: unknown): string[] {
  const links = normalizeHeatSheetUrls(value)
  return links?.map((l) => l.url) ?? []
}

export const normalizeFinalsHeatSheetUrls = normalizeHeatSheetUrls
export const finalsHeatSheetUrlList = heatSheetUrlList

/** Uploaded meet doc (Supabase public URL or legacy local /meet-files path). */
export function isStoredMeetFileUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const trimmed = url.trim()
  if (trimmed.startsWith("/meet-files/")) return true
  return trimmed.includes(`/storage/v1/object/public/${MEET_FILE_BUCKET}/`)
}

/** Object key inside the meet-files bucket (decoded), e.g. `meets/<id>/Psych Sheet.pdf`. */
export function storagePathFromMeetFileUrl(url: string): string | null {
  const marker = `/object/public/${MEET_FILE_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const rest = url.slice(idx + marker.length).split("?")[0].split("#")[0]
  if (!rest) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}
