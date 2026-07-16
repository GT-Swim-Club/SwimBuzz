export const AVATAR_BUCKET = "avatars"

/** Max upload after client-side resize (JPEG ~192px is typically well under this). */
export const AVATAR_MAX_BYTES = 256 * 1024

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "")
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    throw new Error(
      "Supabase storage is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    )
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

function formatStorageError(message: string) {
  if (message.includes("row-level security")) {
    return (
      `${message} — use the service_role secret in SUPABASE_SERVICE_ROLE_KEY, ` +
      "make sure the avatars bucket exists, and run supabase/avatars-storage.sql in the SQL editor."
    )
  }
  return message
}

/** One object per user — upsert replaces the previous file to avoid orphaned storage. */
export function avatarStoragePath(userId: string) {
  return `${userId}.jpg`
}

export function isStoredAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.includes(`/storage/v1/object/public/${AVATAR_BUCKET}/`)
}

export function storagePathFromAvatarUrl(url: string): string | null {
  const marker = `/object/public/${AVATAR_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const rest = url.slice(idx + marker.length)
  return rest.split("?")[0] || null
}

export async function uploadAvatar(
  userId: string,
  bytes: Buffer,
  contentType: string
): Promise<{ url: string; path: string }> {
  const { url, key } = getSupabaseConfig()
  const storagePath = avatarStoragePath(userId)

  const res = await fetch(
    `${url}/storage/v1/object/${AVATAR_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: storageHeaders(key, {
        "Content-Type": contentType,
        "x-upsert": "true",
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

  // Cache-bust so browsers pick up replacements at the same storage path.
  return {
    url: `${url}/storage/v1/object/public/${AVATAR_BUCKET}/${storagePath}?v=${Date.now()}`,
    path: storagePath,
  }
}

export async function deleteStoredAvatar(url: string | null | undefined) {
  if (!url || !isStoredAvatarUrl(url)) return

  const storagePath = storagePathFromAvatarUrl(url)
  if (!storagePath) return

  const { url: baseUrl, key } = getSupabaseConfig()
  const res = await fetch(
    `${baseUrl}/storage/v1/object/${AVATAR_BUCKET}/${storagePath}`,
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
