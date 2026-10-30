import sharp from "sharp"
import { meetIconStorageUrl } from "@/lib/meet/meet-storage"

const ICON_MAX_BYTES = 5 * 1024 * 1024
const ICON_EDGE_PX = 256
/** Matches the Share PNG's rounded-xl corners on its 80px icon. */
const ICON_RADIUS_PX = Math.round((ICON_EDGE_PX * 12) / 80)

/**
 * The meet icon as a square PNG with rounded corners, ready for jsPDF (which can't read
 * WebP/HEIC uploads or clip images itself). Null when there's no icon in our storage or it
 * can't be fetched — the PDF just goes without it.
 */
export async function loadMeetIconPng(iconUrl: string | null): Promise<Uint8Array | null> {
  const url = meetIconStorageUrl(iconUrl)
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length > ICON_MAX_BYTES) return null
    // Alpha mask only — the fill color is irrelevant.
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_EDGE_PX}" height="${ICON_EDGE_PX}">` +
        `<rect width="${ICON_EDGE_PX}" height="${ICON_EDGE_PX}" rx="${ICON_RADIUS_PX}" ry="${ICON_RADIUS_PX}"/></svg>`
    )
    const png = await sharp(bytes)
      .resize(ICON_EDGE_PX, ICON_EDGE_PX, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer()
    return new Uint8Array(png)
  } catch {
    return null
  }
}
