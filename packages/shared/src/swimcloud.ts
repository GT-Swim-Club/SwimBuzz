/** SwimCloud swimmer IDs are 6 or 7 digits; inputs also take a swimcloud.com/swimmer/… profile link. */
export const SWIMCLOUD_ID_ERROR = "Enter a 6–7 digit SwimCloud ID or a SwimCloud profile link"

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
 * A SwimCloud profile cell or input: a bare swimmer ID, or a profile URL.
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
  return parseSwimCloudProfile(raw) !== null
}

/**
 * For an input's change handler: a pasted profile link collapses to its ID so the field shows
 * what will be saved; anything else is kept as typed.
 */
export function normalizeSwimCloudIdInput(raw: string): string {
  if (!SWIMCLOUD_SWIMMER_URL.test(raw)) return raw
  const id = parseSwimCloudProfile(raw)
  return id === null ? raw : String(id)
}

/** SwimCloud sometimes splits one swimmer across profiles; an athlete holds at most this many. */
export const MAX_SWIMCLOUD_IDS = 5
export const SWIMCLOUD_IDS_LIMIT_ERROR = `An athlete can have at most ${MAX_SWIMCLOUD_IDS} SwimCloud IDs`

/**
 * Every SwimCloud ID/profile link in `raw`, split on commas, semicolons, and whitespace.
 * Deduped, in order. Pieces that are not an ID or profile link are reported in `invalid`.
 */
export function parseSwimCloudProfileList(raw: string): { ids: number[]; invalid: string[] } {
  const ids: number[] = []
  const invalid: string[] = []
  for (const piece of raw.split(/[\s,;]+/)) {
    if (!piece) continue
    const id = parseSwimCloudProfile(piece)
    if (id == null) invalid.push(piece)
    else if (!ids.includes(id)) ids.push(id)
  }
  return { ids, invalid }
}

/**
 * For a multi-ID input: add every ID/link in `text` to `current`, up to MAX_SWIMCLOUD_IDS.
 * `leftover` holds what couldn't be added (invalid pieces, IDs past the limit) to keep in the box.
 */
export function addSwimCloudIds(current: number[], text: string): { ids: number[]; leftover: string } {
  const { ids: parsed, invalid } = parseSwimCloudProfileList(text)
  const ids = [...current]
  const leftover = [...invalid]
  for (const id of parsed) {
    if (ids.includes(id)) continue
    if (ids.length < MAX_SWIMCLOUD_IDS) ids.push(id)
    else leftover.push(String(id))
  }
  return { ids, leftover: leftover.join(" ") }
}
