import { NextResponse } from "next/server"
import { normalizeFileUrl } from "@/lib/meet/meet-file-fetch"
import { fetchPublicHttpUrl } from "@/lib/public-http-url"
import { getSession } from "@/lib/auth/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_PDF_BYTES = 20 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

function isPdf(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && new TextDecoder().decode(bytes.subarray(0, 4)) === "%PDF"
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rawUrl = new URL(req.url).searchParams.get("url")?.trim()
  if (!rawUrl) return NextResponse.json({ error: "A PDF URL is required" }, { status: 400 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetchPublicHttpUrl(normalizeFileUrl(rawUrl), {
      signal: controller.signal,
      headers: { Accept: "application/pdf" },
    })
    if (!response.ok) return NextResponse.json({ error: `Could not load this PDF (${response.status})` }, { status: 502 })

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "The PDF must be 20 MB or smaller" }, { status: 413 })
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_PDF_BYTES) return NextResponse.json({ error: "The PDF must be 20 MB or smaller" }, { status: 413 })
    if (!isPdf(bytes)) return NextResponse.json({ error: "This URL does not point to a PDF" }, { status: 415 })

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch {
    return NextResponse.json({ error: "Could not load this PDF" }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
