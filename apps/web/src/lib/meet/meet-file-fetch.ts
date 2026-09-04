import path from "path"
import { readFile } from "fs/promises"
import { isParsablePacketUrl } from "@/lib/meet/meet-event-order"

export function normalizeFileUrl(url: string): string {
  try {
    const parsed = new URL(url)

    const driveMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/)
    if (parsed.hostname.includes("drive.google.com") && driveMatch) {
      return `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`
    }

    if (parsed.hostname.includes("dropbox.com")) {
      parsed.searchParams.set("dl", "1")
      return parsed.toString()
    }
  } catch {
    // Use the original URL if parsing fails.
  }
  return url
}

function isPdfContent(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.subarray(0, 4).toString("utf8") === "%PDF"
}

export async function fetchMeetFileBytes(url: string): Promise<Buffer> {
  if (url.startsWith("/meet-files/")) {
    const filePath = path.join(process.cwd(), "public", url)
    const bytes = await readFile(filePath)
    if (!isPdfContent(bytes)) {
      throw new Error("Meet file is not a PDF")
    }
    return bytes
  }

  if (!isParsablePacketUrl(url)) {
    throw new Error("Unsupported file URL")
  }

  const res = await fetch(normalizeFileUrl(url), { redirect: "follow" })
  if (!res.ok) {
    throw new Error(`Could not download file (${res.status})`)
  }

  const bytes = Buffer.from(await res.arrayBuffer())
  if (!isPdfContent(bytes)) {
    throw new Error("URL does not point to a PDF")
  }
  return bytes
}
