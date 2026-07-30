import path from "path"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { randomUUID } from "crypto"
import sharp from "sharp"

export const runtime = "nodejs"

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB for upload
const ICON_MAX_EDGE = 512 // Larger than avatar (192px)
const ICON_JPEG_QUALITY = 90 // Higher quality than avatar (82)
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".heic", ".heif"])

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
}

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
    ...extra,
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!isUpload(file)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 })
  }

  const ext = path.extname(file.name).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type — use PNG, JPG, GIF, WebP, SVG, or HEIC" },
      { status: 400 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 })
  }

  try {
    let processedBytes = bytes
    let finalExt = ext === ".svg" ? ext : ".jpg"
    
    // Compress image if it's not SVG
    if (ext !== ".svg") {
      try {
        const image = sharp(bytes)
        const metadata = await image.metadata()
        
        // Resize if larger than max edge
        if (metadata.width && metadata.height && 
            (metadata.width > ICON_MAX_EDGE || metadata.height > ICON_MAX_EDGE)) {
          image.resize(ICON_MAX_EDGE, ICON_MAX_EDGE, {
            fit: "inside",
            withoutEnlargement: true,
          })
        }
        
        // Convert to PNG/JPEG with compression
        if (metadata.hasAlpha) {
            processedBytes = await image.png().toBuffer()
            finalExt = ".png"
        } else {
            processedBytes = await image
              .jpeg({ quality: ICON_JPEG_QUALITY })
              .toBuffer()
            finalExt = ".jpg"
        }
      } catch {
        // If Sharp processing fails, use original bytes
      }
    }

    const { url: baseUrl, key } = getSupabaseConfig()
    const uuid = randomUUID()
    const storagePath = `icons/${uuid}${finalExt}`
    const contentType = finalExt === ".svg" ? (file.type || MIME[ext]) : "image/jpeg"

    const res = await fetch(
      `${baseUrl}/storage/v1/object/meet-icons/${storagePath}`,
      {
        method: "POST",
        headers: storageHeaders(key, {
          "Content-Type": contentType,
          "x-upsert": "false",
        }),
        body: new Uint8Array(processedBytes),
      }
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message =
        (body as { message?: string; error?: string }).message ??
        (body as { error?: string }).error ??
        res.statusText
      throw new Error(message)
    }

    const iconUrl = `${baseUrl}/storage/v1/object/public/meet-icons/${storagePath}`
    return NextResponse.json({ url: iconUrl, name: file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user.role === "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const url = String(body.url ?? "").trim()
  if (!url || !url.includes("/storage/v1/object/public/meet-icons/")) {
    return NextResponse.json({ error: "Invalid icon URL" }, { status: 400 })
  }

  try {
    const { url: baseUrl, key } = getSupabaseConfig()
    const marker = "/object/public/meet-icons/"
    const idx = url.indexOf(marker)
    if (idx === -1) {
      return NextResponse.json({ error: "Invalid icon URL" }, { status: 400 })
    }
    const storagePath = url.slice(idx + marker.length)

    const res = await fetch(
      `${baseUrl}/storage/v1/object/meet-icons/${storagePath}`,
      {
        method: "DELETE",
        headers: storageHeaders(key),
      }
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
