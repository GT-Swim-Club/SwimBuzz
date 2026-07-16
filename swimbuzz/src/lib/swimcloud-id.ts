/** SwimCloud swimmer IDs are always exactly 7 digits. */
export const SWIMCLOUD_ID_ERROR = "SwimCloud ID must be exactly 7 digits"

const SWIMCLOUD_ID_PATTERN = /^\d{7}$/

/** Returns the ID if `raw` is exactly 7 digits; otherwise null. */
export function parseSwimCloudId(raw: unknown): number | null {
  const s = String(raw ?? "").trim()
  if (!SWIMCLOUD_ID_PATTERN.test(s)) return null
  return parseInt(s, 10)
}

export function isValidSwimCloudIdInput(raw: string): boolean {
  return SWIMCLOUD_ID_PATTERN.test(raw.trim())
}
