import { NextResponse } from "next/server"
import { uploadMeetFile, deleteStoredMeetFile } from "@/lib/meet-storage"
import { isStoredMeetFileUrl } from "@/lib/meet-files"
import sharp from "sharp"
import { getSession } from "@/lib/session"
import { resolvedFileExt } from "@/lib/upload-file-ext"

export const runtime = "nodejs"

const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".gif"])

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"}

function isUpload(value: unknown): value is File {
  return value != null && typeof value !== "string" && typeof (value as File).arrayBuffer === "function"
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.user.role !== "COACH") {
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
      { error: "Unsupported file type — use PDF, Word, Excel, CSV, TXT, or images (PNG, JPG, WEBP, GIF)" },
      { status: 400 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 20 MB or smaller" }, { status: 400 })
  }

  let finalBytes = bytes
  let finalContentType = file.type || MIME[ext] || "application/octet-stream"

  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)
  if (isImage) {
    try {
      const image = sharp(bytes)
      const metadata = await image.metadata()

      if (metadata.width && metadata.height && (metadata.width > 1200 || metadata.height > 1200)) {
        image.resize(1200, 1200, {
          fit: "inside",
          withoutEnlargement: true})
      }

      if (ext === ".png") {
        finalBytes = await image.png({ quality: 80, compressionLevel: 9 }).toBuffer()
      } else if (ext === ".webp") {
        finalBytes = await image.webp({ quality: 75 }).toBuffer()
      } else if (ext === ".gif") {
        finalBytes = await image.gif().toBuffer()
      } else {
        finalBytes = await image.jpeg({ quality: 75, progressive: true }).toBuffer()
      }
    } catch (e) {
      console.error("Image compression failed, using original file:", e)
      finalBytes = bytes
    }
  }

  try {
    const { url } = await uploadMeetFile(finalBytes, file.name, finalContentType)
    return NextResponse.json({ url, name: file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const url = String(body.url ?? "").trim()
  if (!url || !isStoredMeetFileUrl(url)) {
    return NextResponse.json({ error: "Invalid file URL" }, { status: 400 })
  }

  try {
    await deleteStoredMeetFile(url)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
