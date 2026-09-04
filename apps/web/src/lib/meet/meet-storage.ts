import { randomUUID } from "crypto"
import path from "path"
import { unlink } from "fs/promises"
import {
  MEET_FILE_BUCKET,
  MEET_FILE_URL_KEYS,
  type MeetFileUrlKey,
  finalsHeatSheetUrlList,
  heatSheetUrlList,
  isStoredMeetFileUrl,
} from "@/lib/meet/meet-files"

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


function parsePublicStorageUrl(
  url: string
): { bucket: string; path: string } | null {
  const marker = "/storage/v1/object/public/"
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const rest = url.slice(idx + marker.length)
  const slash = rest.indexOf("/")
  if (slash <= 0) return null
  const bucket = rest.slice(0, slash)
  const rawPath = rest.slice(slash + 1).split("?")[0].split("#")[0]
  if (!bucket || !rawPath) return null
  try {
    return { bucket, path: decodeURIComponent(rawPath) }
  } catch {
    return { bucket, path: rawPath }
  }
}

function encodeStoragePath(storagePath: string) {
  return storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

/** Remove a stored file from Supabase (or legacy local disk) using its public URL. */
export async function deleteStoredFileByUrl(url: string | null | undefined) {
  if (!url) return
  const trimmed = url.trim()
  if (!trimmed) return

  // Handle legacy local files
  if (trimmed.startsWith("/meet-files/")) {
    try {
      await unlink(path.join(process.cwd(), "public", trimmed))
    } catch {
      // File may already be gone.
    }
    return
  }

  const parsed = parsePublicStorageUrl(trimmed)
  if (!parsed) return

  const { url: baseUrl, key } = getSupabaseConfig()
  const res = await fetch(
    `${baseUrl}/storage/v1/object/${parsed.bucket}/${encodeStoragePath(parsed.path)}`,
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

export type MeetStoredFiles = Record<MeetFileUrlKey, string | null> & {
  heatSheetUrls?: unknown
  finalsHeatSheetUrls?: unknown
  iconUrl?: string | null
  bannerUrl?: string | null
  photos?: unknown
}

function pushPhotoUrl(urls: string[], value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed) urls.push(trimmed)
    return
  }
  if (value && typeof value === "object" && "url" in value) {
    const url = (value as { url?: unknown }).url
    if (typeof url === "string" && url.trim()) urls.push(url.trim())
  }
}

function photoPreviewUrls(photos: unknown): string[] {
  if (!photos || typeof photos !== "object") return []

  const urls: string[] = []
  if (Array.isArray(photos)) {
    for (const item of photos) pushPhotoUrl(urls, item)
    return urls
  }

  const obj = photos as { previews?: unknown; links?: unknown }
  if (Array.isArray(obj.previews)) {
    for (const item of obj.previews) pushPhotoUrl(urls, item)
  }
  if (Array.isArray(obj.links)) {
    for (const item of obj.links) pushPhotoUrl(urls, item)
  }
  return urls
}

function allMeetStoredUrls(meet: MeetStoredFiles): string[] {
  return [
    ...MEET_FILE_URL_KEYS.map((key) => meet[key]),
    meet.iconUrl,
    meet.bannerUrl,
    ...heatSheetUrlList(meet.heatSheetUrls),
    ...finalsHeatSheetUrlList(meet.finalsHeatSheetUrls),
    ...photoPreviewUrls(meet.photos),
  ].filter((url): url is string => Boolean(url && url.trim()))
}

async function deleteStoredUrls(urls: Iterable<string>) {
  const unique = [...new Set([...urls].map((url) => url.trim()).filter(Boolean))]
  const results = await Promise.allSettled(
    unique.map((url) =>
      isStoredMeetFileUrl(url) ? deleteStoredMeetFile(url) : deleteStoredFileByUrl(url)
    )
  )
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Failed to delete stored meet file:", result.reason)
    }
  }
}

export async function deleteRemovedMeetFiles(
  before: MeetStoredFiles,
  after: Record<string, unknown>
) {
  for (const key of MEET_FILE_URL_KEYS) {
    // heatSheetUrls owns the lifecycle of the legacy primary heatSheetUrl.
    if (key === "heatSheetUrl" && "heatSheetUrls" in after) continue
    if (!(key in after)) continue
    const oldUrl = before[key]
    const newUrl = (after[key] as string | null) ?? null
    if (oldUrl && oldUrl !== newUrl) {
      await deleteStoredMeetFile(oldUrl)
    }
  }

  for (const key of ["iconUrl", "bannerUrl"] as const) {
    if (!(key in after)) continue
    const oldUrl = before[key]
    const newUrl = (after[key] as string | null) ?? null
    if (oldUrl && oldUrl !== newUrl) {
      await deleteStoredFileByUrl(oldUrl)
    }
  }

  if ("heatSheetUrls" in after) {
    const oldUrls = new Set([
      ...(before.heatSheetUrl ? [before.heatSheetUrl] : []),
      ...heatSheetUrlList(before.heatSheetUrls),
    ])
    const newUrls = new Set(heatSheetUrlList(after.heatSheetUrls))
    await Promise.all(
      [...oldUrls]
        .filter((url) => !newUrls.has(url))
        .map((url) => deleteStoredMeetFile(url))
    )
  }

  if ("finalsHeatSheetUrls" in after) {
    const oldUrls = new Set(finalsHeatSheetUrlList(before.finalsHeatSheetUrls))
    const newUrls = new Set(finalsHeatSheetUrlList(after.finalsHeatSheetUrls))
    await Promise.all(
      [...oldUrls]
        .filter((url) => !newUrls.has(url))
        .map((url) => deleteStoredMeetFile(url))
    )
  }

  if ("photos" in after) {
    const oldUrls = new Set(photoPreviewUrls(before.photos))
    const newUrls = new Set(photoPreviewUrls(after.photos))
    await Promise.all(
      [...oldUrls]
        .filter((url) => !newUrls.has(url))
        .map((url) => deleteStoredMeetFile(url))
    )
  }
}

/** Delete newly added stored files in `after` that are not on `before`. */
export async function deleteAddedMeetFiles(
  before: MeetStoredFiles,
  after: Record<string, unknown>
) {
  for (const key of MEET_FILE_URL_KEYS) {
    if (key === "heatSheetUrl" && "heatSheetUrls" in after) continue
    if (!(key in after)) continue
    const oldUrl = before[key] ?? null
    const newUrl = (after[key] as string | null) ?? null
    if (newUrl && newUrl !== oldUrl) {
      await deleteStoredMeetFile(newUrl)
    }
  }

  for (const key of ["iconUrl", "bannerUrl"] as const) {
    if (!(key in after)) continue
    const oldUrl = before[key] ?? null
    const newUrl = (after[key] as string | null) ?? null
    if (newUrl && newUrl !== oldUrl) {
      await deleteStoredFileByUrl(newUrl)
    }
  }

  if ("heatSheetUrls" in after) {
    const oldUrls = new Set([
      ...(before.heatSheetUrl ? [before.heatSheetUrl] : []),
      ...heatSheetUrlList(before.heatSheetUrls),
    ])
    await Promise.all(
      heatSheetUrlList(after.heatSheetUrls)
        .filter((url) => !oldUrls.has(url))
        .map((url) => deleteStoredMeetFile(url))
    )
  }

  if ("finalsHeatSheetUrls" in after) {
    const oldUrls = new Set(finalsHeatSheetUrlList(before.finalsHeatSheetUrls))
    await Promise.all(
      finalsHeatSheetUrlList(after.finalsHeatSheetUrls)
        .filter((url) => !oldUrls.has(url))
        .map((url) => deleteStoredMeetFile(url))
    )
  }

  if ("photos" in after) {
    const oldUrls = new Set(photoPreviewUrls(before.photos))
    await Promise.all(
      photoPreviewUrls(after.photos)
        .filter((url) => !oldUrls.has(url))
        .map((url) => deleteStoredMeetFile(url))
    )
  }
}

export async function deleteAllMeetFiles(meet: MeetStoredFiles) {
  await deleteStoredUrls(allMeetStoredUrls(meet))
}
