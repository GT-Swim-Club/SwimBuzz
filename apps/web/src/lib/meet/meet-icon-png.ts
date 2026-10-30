import sharp from "sharp"
import { meetIconStorageUrl } from "@/lib/meet/meet-storage"

const ICON_MAX_BYTES = 5 * 1024 * 1024
const ICON_EDGE_PX = 256
/** Alpha at or below this counts as transparent margin (matches MeetListThumb). */
const ALPHA_THRESHOLD = 8

/**
 * The meet icon as a square PNG, ready for jsPDF (which can't read WebP/HEIC uploads). Like
 * MeetListThumb, transparent margins are trimmed and the visible logo is fitted whole into the
 * square on a transparent background, so nothing gets cropped. Null when there's no icon in our
 * storage or it can't be fetched — the PDF just goes without it.
 */
export async function loadMeetIconPng(iconUrl: string | null): Promise<Uint8Array | null> {
  const url = meetIconStorageUrl(iconUrl)
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > ICON_MAX_BYTES) return null
    const { data, info } = await sharp(bytes)
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const { width, height, channels } = info
    let x0 = width
    let y0 = height
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * channels + 3] > ALPHA_THRESHOLD) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (x1 < 0) return null
    const png = await sharp(data, { raw: { width, height, channels } })
      .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
      .resize(ICON_EDGE_PX, ICON_EDGE_PX, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer()
    return new Uint8Array(png)
  } catch {
    return null
  }
}
