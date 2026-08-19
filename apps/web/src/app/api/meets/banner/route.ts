import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import sharp from "sharp"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"
import { resolvedFileExt } from "@/lib/upload-file-ext"

export const runtime = "nodejs"

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB for banner upload
const BANNER_MAX_WIDTH = 1200 
const BANNER_JPEG_QUALITY = 85
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".heic", ".heif"])

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif"}

function isUpload(value: unknown): value is File {
  return value != null && typeof value !== "string" && typeof (value as File).arrayBuffer === "function"
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error("Supabase storage is not configured")
  }
  return { url, key }
}

function storageHeaders(key: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...extra}
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!isUpload(file)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }

  const ext = resolvedFileExt(file, ALLOWED_EXT, MIME)
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported file type — use PNG, JPG, WebP, SVG, or HEIC" },
      { status: 400 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 10 MB or smaller" }, { status: 400 })
  }

  try {
    let processedBytes = bytes
    
    // Compress image if it's not SVG
    if (ext !== ".svg") {
      try {
        const image = sharp(bytes)
        const metadata = await image.metadata()
        
        // Resize if larger than max width
        if (metadata.width && metadata.width > BANNER_MAX_WIDTH) {
          image.resize(BANNER_MAX_WIDTH, null, {
            fit: "inside",
            withoutEnlargement: true})
        }
        
        // Convert to JPEG with compression
        processedBytes = await image
          .jpeg({ quality: BANNER_JPEG_QUALITY })
          .toBuffer()
      } catch {
        // If Sharp processing fails, use original bytes
      }
    }

    const { url: baseUrl, key } = getSupabaseConfig()
    const uuid = randomUUID()
    const finalExt = ext === ".svg" ? ext : ".jpg"
    const storagePath = `banners/${uuid}${finalExt}`
    const contentType = finalExt === ".svg" ? (file.type || MIME[ext]) : "image/jpeg"

    const res = await fetch(
      `${baseUrl}/storage/v1/object/meet-banners/${storagePath}`,
      {
        method: "POST",
        headers: storageHeaders(key, {
          "Content-Type": contentType,
          "x-upsert": "false"}),
        body: new Uint8Array(processedBytes)}
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message =
        (body as { message?: string; error?: string }).message ??
        (body as { error?: string }).error ??
        res.statusText
      throw new Error(message)
    }

    const bannerUrl = `${baseUrl}/storage/v1/object/public/meet-banners/${storagePath}`
    return NextResponse.json({ url: bannerUrl, name: file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const url = String(body.url ?? "").trim()
  if (!url || !url.includes("/storage/v1/object/public/meet-banners/")) {
    return NextResponse.json({ error: "Invalid banner URL" }, { status: 400 })
  }

  try {
    const { url: baseUrl, key } = getSupabaseConfig()
    const marker = "/object/public/meet-banners/"
    const idx = url.indexOf(marker)
    if (idx === -1) {
      return NextResponse.json({ error: "Invalid banner URL" }, { status: 400 })
    }
    const storagePath = url.slice(idx + marker.length)

    const res = await fetch(
      `${baseUrl}/storage/v1/object/meet-banners/${storagePath}`,
      {
        method: "DELETE",
        headers: storageHeaders(key)}
    )

    if (!res.ok && res.status !== 404) {
      const body = await res.json().catch(() => ({}))
      const message =
        (body as { message?: string; error?: string }).message ??
        (body as { error?: string }).error ??
        res.statusText
      throw new Error(message)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
