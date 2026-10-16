/** SwimCloud swimmer IDs are 6 or 7 digits. */
export const SWIMCLOUD_ID_ERROR = "SwimCloud ID must be 6 or 7 digits"
export const SWIMCLOUD_ID_MAX_LENGTH = 7

const SWIMCLOUD_ID_PATTERN = /^\d{6,7}$/
/** Profile links look like https://www.swimcloud.com/swimmer/1792135/ */
const SWIMCLOUD_SWIMMER_URL = /swimcloud\.com\/swimmer\/(\d{6,7})(?=[/?#]|$)/i

/** Returns the ID if `raw` is 6 or 7 digits; otherwise null. */
export function parseSwimCloudId(raw: unknown): number | null {
  const s = String(raw ?? "").trim()
  if (!SWIMCLOUD_ID_PATTERN.test(s)) return null
  return parseInt(s, 10)
}

/**
 * A SwimCloud profile cell: a bare swimmer ID, or a profile URL.
 * Team, meet, and other SwimCloud links are ignored.
 */
export function parseSwimCloudProfile(raw: unknown): number | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  const fromUrl = s.match(SWIMCLOUD_SWIMMER_URL)
  if (fromUrl) return parseInt(fromUrl[1], 10)
  return parseSwimCloudId(s)
}

export function isValidSwimCloudIdInput(raw: string): boolean {
  return SWIMCLOUD_ID_PATTERN.test(raw.trim())
}
