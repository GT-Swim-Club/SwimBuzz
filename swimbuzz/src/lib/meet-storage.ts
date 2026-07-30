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

/** Check if a file exists in Supabase storage. */
async function fileExists(
  url: string,
  key: string,
  storagePath: string
): Promise<boolean> {
  const res = await fetch(
    `${url}/storage/v1/object/${MEET_FILE_BUCKET}/${storagePath}`,
    {
      method: "HEAD",
      headers: storageHeaders(key),
    }
  )
  return res.ok
}

/** Find an available filename with counter suffix if needed. */
async function findAvailableFilename(
  url: string,
  key: string,
  nameWithoutExt: string,
  ext: string
): Promise<string> {
  let storagePath = `uploads/${nameWithoutExt}${ext}`
  if (!(await fileExists(url, key, storagePath))) {
    return storagePath
  }

  for (let counter = 1; counter <= 1000; counter++) {
    storagePath = `uploads/${nameWithoutExt} (${counter})${ext}`
    if (!(await fileExists(url, key, storagePath))) {
      return storagePath
    }
  }

  throw new Error("Could not find available filename after 1000 attempts")
}

export async function uploadMeetFile(
  bytes: Buffer,
  originalName: string,
  contentType: string
): Promise<{ url: string; path: string }> {
  const { url, key } = getSupabaseConfig()
  const ext = path.extname(originalName).toLowerCase()
  const nameWithoutExt = path.basename(originalName, ext)
  const storagePath = await findAvailableFilename(url, key, nameWithoutExt, ext)

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


/** Remove a stored file from Supabase (or legacy local disk) using its public URL. */
export async function deleteStoredFileByUrl(url: string | null | undefined) {
  if (!url) return

  // Handle legacy local files
  if (url.startsWith("/meet-files/")) {
    try {
      await unlink(path.join(process.cwd(), "public", url))
    } catch {
      // File may already be gone.
    }
    return
  }

  // Handle Supabase files
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!match) return

  const bucket = match[1]
  const storagePath = match[2]

  const { url: baseUrl, key } = getSupabaseConfig()
  const res = await fetch(
    `${baseUrl}/storage/v1/object/${bucket}/${storagePath}`,
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

/** Remove a stored meet file from Supabase (or legacy local disk). */
export async function deleteStoredMeetFile(url: string | null | undefined) {
  if (!url || !isStoredMeetFileUrl(url)) return
  await deleteStoredFileByUrl(url)
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
