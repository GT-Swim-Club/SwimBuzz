export const MEET_FILE_BUCKET = "meet-files"

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

export type FinalsHeatSheetLink = {
  url: string
  name?: string
}

export function normalizeFinalsHeatSheetUrls(
  value: unknown
): FinalsHeatSheetLink[] | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value)) return null
  const links: FinalsHeatSheetLink[] = []
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

export function finalsHeatSheetUrlList(value: unknown): string[] {
  const links = normalizeFinalsHeatSheetUrls(value)
  return links?.map((l) => l.url) ?? []
}

/** Uploaded meet doc (Supabase public URL or legacy local /meet-files path). */
export function isStoredMeetFileUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.startsWith("/meet-files/")) return true
  return url.includes(`/storage/v1/object/public/${MEET_FILE_BUCKET}/`)
}

export function storagePathFromMeetFileUrl(url: string): string | null {
  const marker = `/object/public/${MEET_FILE_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}
