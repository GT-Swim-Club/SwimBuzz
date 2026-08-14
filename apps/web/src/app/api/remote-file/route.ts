import { NextResponse } from "next/server"
import { normalizeFileUrl } from "@/lib/meet-file-fetch"
import { fetchPublicHttpUrl } from "@/lib/public-http-url"
import { getSession } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BYTES = 50 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const MIME_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/csv": ".csv",
  "text/plain": ".txt",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.byteLength >= 4 && new TextDecoder().decode(bytes.subarray(0, 4)) === "%PDF") {
    return "application/pdf"
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png"
  }
  if (bytes.byteLength >= 6 && new TextDecoder().decode(bytes.subarray(0, 6)).startsWith("GIF8")) {
    return "image/gif"
  }
  if (
    bytes.byteLength >= 12 &&
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const encoded = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].replace(/["']/g, "").trim())
    } catch {
      return encoded[1].replace(/["']/g, "").trim()
    }
  }
  const plain = header.match(/filename="?([^";]+)"?/i)
  return plain?.[1]?.trim() ?? null
}

function filenameFromUrl(url: URL, mime: string): string {
  const base = decodeURIComponent(url.pathname.split("/").pop() || "").split(/[?#]/)[0]
  const ext = MIME_EXT[mime] ?? ""
  if (base && /\.[a-z0-9]+$/i.test(base)) return base
  return `${base || "download"}${ext}`
}

function safeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 180) || "download"
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const rawUrl = String(body.url ?? "").trim()
  if (!rawUrl) return NextResponse.json({ error: "A file URL is required" }, { status: 400 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchPublicHttpUrl(normalizeFileUrl(rawUrl), {
      signal: controller.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": BROWSER_UA,
      },
    })
    if (!response.ok) {
      return NextResponse.json(
        { error: `Could not download that file (${response.status})` },
        { status: 502 }
      )
    }

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large to import" }, { status: 413 })
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large to import" }, { status: 413 })
    }

    const sniffed = sniffMime(bytes)
    const contentType =
      sniffed ||
      response.headers.get("content-type")?.split(";")[0]?.trim() ||
      "application/octet-stream"
    const filename = safeFilename(
      filenameFromDisposition(response.headers.get("content-disposition")) ||
        filenameFromUrl(new URL(response.url || normalizeFileUrl(rawUrl)), contentType)
    )

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    console.error("remote-file failed", rawUrl, err)
    return NextResponse.json({ error: "Could not download that file" }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
