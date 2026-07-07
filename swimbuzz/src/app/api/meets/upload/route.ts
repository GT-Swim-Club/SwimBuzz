import path from "path"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { uploadMeetFile, deleteStoredMeetFile } from "@/lib/meet-storage"
import { isStoredMeetFileUrl } from "@/lib/meet-files"

export const runtime = "nodejs"

const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"])

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
}

function isUpload(value: unknown): value is File {
  return value != null && typeof value !== "string" && typeof (value as File).arrayBuffer === "function"
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
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
      { error: "Unsupported file type — use PDF, Word, Excel, CSV, or TXT" },
      { status: 400 }
    )
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 20 MB or smaller" }, { status: 400 })
  }

  try {
    const contentType = file.type || MIME[ext] || "application/octet-stream"
    const { url } = await uploadMeetFile(bytes, file.name, contentType)
    return NextResponse.json({ url, name: file.name })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !["COACH", "EXEC"].includes(session.user.role)) {
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
