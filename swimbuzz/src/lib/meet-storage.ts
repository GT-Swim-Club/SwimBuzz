import { randomUUID } from "crypto"
import path from "path"
import { unlink } from "fs/promises"
import {
  MEET_FILE_BUCKET,
  MEET_FILE_URL_KEYS,
  type MeetFileUrlKey,
  isStoredMeetFileUrl,
  storagePathFromMeetFileUrl,
} from "@/lib/meet-files"

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "")
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error(
      "Supabase storage is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
  }
  assertServiceRoleKey(key)
  return { url, key }
}

/** Catch the common mistake of pasting the anon/publishable key instead of service_role. */
function assertServiceRoleKey(key: string) {
  if (!key.startsWith("eyJ")) return
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString("utf8")
    ) as { role?: string }
    if (payload.role === "anon") {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY is the anon key. In Supabase go to Project Settings → API and copy the service_role secret (not the anon public key)."
      )
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("service_role")) throw err
  }
}

function storageHeaders(key: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
    ...extra,
  }
}

function formatStorageError(message: string) {
  if (message.includes("row-level security")) {
    return (
      `${message} — use the service_role secret in SUPABASE_SERVICE_ROLE_KEY, ` +
      "make sure the meet-files bucket exists, and run supabase/meet-files-storage.sql in the SQL editor."
    )
  }
  return message
}

export async function uploadMeetFile(
  bytes: Buffer,
  originalName: string,
  contentType: string
): Promise<{ url: string; path: string }> {
  const { url, key } = getSupabaseConfig()
  const ext = path.extname(originalName).toLowerCase()
  const storagePath = `uploads/${randomUUID()}${ext}`

  const res = await fetch(
    `${url}/storage/v1/object/${MEET_FILE_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: storageHeaders(key, {
        "Content-Type": contentType,
        "x-upsert": "false",
      }),
      body: new Uint8Array(bytes),
    }
  )

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message =
      (body as { message?: string; error?: string }).message ??
      (body as { error?: string }).error ??
      res.statusText
    throw new Error(formatStorageError(message))
  }

  return {
    url: `${url}/storage/v1/object/public/${MEET_FILE_BUCKET}/${storagePath}`,
    path: storagePath,
  }
}

/** Remove a stored meet file from Supabase (or legacy local disk). */
export async function deleteStoredMeetFile(url: string | null | undefined) {
  if (!url || !isStoredMeetFileUrl(url)) return

  if (url.startsWith("/meet-files/")) {
    try {
      await unlink(path.join(process.cwd(), "public", url))
    } catch {
      // File may already be gone.
    }
    return
  }

  const storagePath = storagePathFromMeetFileUrl(url)
  if (!storagePath) return

  const { url: baseUrl, key } = getSupabaseConfig()
  const res = await fetch(
    `${baseUrl}/storage/v1/object/${MEET_FILE_BUCKET}/${storagePath}`,
    {
      method: "DELETE",
      headers: storageHeaders(key),
    }
  )

  if (!res.ok) {
    if (res.status === 404) return
    const body = await res.json().catch(() => ({}))
    const message =
      (body as { message?: string; error?: string }).message ??
      (body as { error?: string }).error ??
      res.statusText
    if (/not found/i.test(message)) return
    throw new Error(formatStorageError(message))
  }
}

export async function deleteRemovedMeetFiles(
  before: Record<MeetFileUrlKey, string | null>,
  after: Record<string, unknown>
) {
  for (const key of MEET_FILE_URL_KEYS) {
    if (!(key in after)) continue
    const oldUrl = before[key]
    const newUrl = (after[key] as string | null) ?? null
    if (oldUrl && oldUrl !== newUrl) {
      await deleteStoredMeetFile(oldUrl)
    }
  }
}

export async function deleteAllMeetFiles(meet: Record<MeetFileUrlKey, string | null>) {
  await Promise.all(MEET_FILE_URL_KEYS.map((key) => deleteStoredMeetFile(meet[key])))
}
