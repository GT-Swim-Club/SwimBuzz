import path from "path"
import { unlink } from "fs/promises"
import { prisma } from "@/lib/prisma"
import { withDeleted } from "../../../soft-delete-policy"
import {
  MEET_FILE_BUCKET,
  MEET_FILE_URL_KEYS,
  PARSE_TMP_FOLDER,
  PENDING_MEET_FILE_FOLDER,
  type MeetFileUrlKey,
  finalsHeatSheetUrlList,
  heatSheetUrlList,
  meetFileFolder,
} from "@/lib/meet/meet-files"
import { meetSlugBase } from "@/lib/slug"

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

class StorageRequestError extends Error {
  constructor(message: string, readonly duplicate: boolean) {
    super(formatStorageError(message))
  }
}

async function storageRequestError(res: Response): Promise<StorageRequestError> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string
    error?: string
    statusCode?: string | number
  }
  const message = body.message ?? body.error ?? res.statusText
  const duplicate =
    res.status === 409 ||
    String(body.statusCode ?? "") === "409" ||
    /already exists|duplicate/i.test(message)
  return new StorageRequestError(message, duplicate)
}

function encodeStoragePath(storagePath: string) {
  return storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function publicStorageUrl(base: string, bucket: string, storagePath: string) {
  return `${base}/storage/v1/object/public/${bucket}/${encodeStoragePath(storagePath)}`
}

/** Check if a file exists in Supabase storage. */
async function fileExists(
  url: string,
  key: string,
  storagePath: string,
  bucket: string = MEET_FILE_BUCKET
): Promise<boolean> {
  const res = await fetch(
    `${url}/storage/v1/object/${bucket}/${encodeStoragePath(storagePath)}`,
    {
      method: "HEAD",
      headers: storageHeaders(key),
    }
  )
  return res.ok
}

/**
 * Readable file name limited to characters Supabase accepts in object keys and
 * that survive a URL unchanged (no `#`, `?`, `%`, `&`, `+` or non-ASCII). The
 * old uploader kept the raw name, so `#`/`?` cut the key short and non-ASCII
 * names failed to upload.
 */
export function safeStorageFileName(originalName: string): { base: string; ext: string } {
  const rawExt = path.extname(originalName)
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10)
  const base = path
    .basename(originalName, rawExt)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, 100)
  return { base: base || "file", ext: ext === "." ? "" : ext }
}

function numberedName(base: string, ext: string, n: number) {
  return n === 0 ? `${base}${ext}` : `${base} (${n})${ext}`
}

/**
 * Upload into `folder` of the meet-files bucket (`meetFileFolder(meetId)` for a
 * meet's files), adding " (1)", " (2)"… when the name is taken.
 */
export async function uploadMeetFile(
  bytes: Buffer,
  originalName: string,
  contentType: string,
  folder: string
): Promise<{ url: string; path: string }> {
  const { url, key } = getSupabaseConfig()
  const { base, ext } = safeStorageFileName(originalName)
  const cleanFolder = folder.replace(/^\/+|\/+$/g, "")

  for (let n = 0; n <= 1000; n++) {
    const storagePath = `${cleanFolder}/${numberedName(base, ext, n)}`
    const res = await fetch(
      `${url}/storage/v1/object/${MEET_FILE_BUCKET}/${encodeStoragePath(storagePath)}`,
      {
        method: "POST",
        headers: storageHeaders(key, {
          "Content-Type": contentType,
          "x-upsert": "false",
        }),
        body: new Uint8Array(bytes),
      }
    )
    if (res.ok) {
      return { url: publicStorageUrl(url, MEET_FILE_BUCKET, storagePath), path: storagePath }
    }
    const err = await storageRequestError(res)
    if (!err.duplicate) throw err
  }

  throw new Error("Could not find available filename after 1000 attempts")
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

/**
 * Public URL of a meet icon in our `meet-icons` bucket, rebuilt on SUPABASE_URL so a
 * server-side fetch never leaves our own storage. Null for icons hosted anywhere else.
 */
export function meetIconStorageUrl(url: string | null | undefined): string | null {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "")
  const parsed = url ? parsePublicStorageUrl(url) : null
  if (!base || !parsed || parsed.bucket !== "meet-icons") return null
  return `${base}/storage/v1/object/public/meet-icons/${encodeStoragePath(parsed.path)}`
}

// ---------------------------------------------------------------------------
// Stored objects and who references them
// ---------------------------------------------------------------------------

/** Buckets whose objects belong to meets; nothing outside them is ever deleted from here. */
const MEET_OWNED_BUCKETS = new Set([MEET_FILE_BUCKET, "meet-icons", "meet-banners"])
/** Pseudo-bucket for legacy files on local disk (`/meet-files/...`). */
const LOCAL_BUCKET = "local-disk"

type StoredObject = { bucket: string; path: string }

function sameStorageHost(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return true
  const base = process.env.SUPABASE_URL
  if (!base) return true
  try {
    return new URL(url).hostname === new URL(base).hostname
  } catch {
    return false
  }
}

/** The object a meet URL points at in our storage, or null for external links. */
function storedObjectFromUrl(url: string | null | undefined): StoredObject | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("/meet-files/")) return { bucket: LOCAL_BUCKET, path: trimmed }
  const parsed = parsePublicStorageUrl(trimmed)
  if (!parsed || !MEET_OWNED_BUCKETS.has(parsed.bucket)) return null
  if (!sameStorageHost(trimmed)) return null
  return parsed
}

function objectId(object: StoredObject) {
  return `${object.bucket}/${object.path}`
}

/** Same object for every spelling of its URL (`?v=` cache busters, %20 vs space). */
function urlObjectId(url: string): string {
  const object = storedObjectFromUrl(url)
  return object ? objectId(object) : url.trim()
}

export type MeetStoredFiles = Record<MeetFileUrlKey, string | null> & {
  id?: string
  heatSheetUrls?: unknown
  finalsHeatSheetUrls?: unknown
  iconUrl?: string | null
  bannerUrl?: string | null
  photos?: unknown
}

const MEET_STORED_FIELDS = [
  ...MEET_FILE_URL_KEYS,
  "iconUrl",
  "bannerUrl",
  "heatSheetUrls",
  "finalsHeatSheetUrls",
  "photos",
] as const

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

function allMeetStoredUrls(meet: Partial<MeetStoredFiles>): string[] {
  return [
    ...MEET_FILE_URL_KEYS.map((key) => meet[key]),
    meet.iconUrl,
    meet.bannerUrl,
    ...heatSheetUrlList(meet.heatSheetUrls),
    ...finalsHeatSheetUrlList(meet.finalsHeatSheetUrls),
    ...photoPreviewUrls(meet.photos),
  ].filter((url): url is string => Boolean(url && url.trim()))
}

/**
 * Every stored object a meet (soft-deleted ones included — they keep their files
 * until purge) or a Nationals standards set points at.
 */
async function referencedObjectIds(exceptMeetId?: string): Promise<Set<string>> {
  const [meets, standards] = await withDeleted(() =>
    Promise.all([
      prisma.meet.findMany({
        where: exceptMeetId ? { id: { not: exceptMeetId } } : undefined,
        select: {
          iconUrl: true,
          bannerUrl: true,
          packetUrl: true,
          psychSheetUrl: true,
          heatSheetUrl: true,
          heatSheetUrls: true,
          finalsHeatSheetUrls: true,
          entriesSheetUrl: true,
          resultsUrl: true,
          rideSignUpsUrl: true,
          roomsUrl: true,
          photos: true,
        },
      }),
      prisma.nationalsStandardSet.findMany({
        where: { sourceUrl: { not: null } },
        select: { sourceUrl: true },
      }),
    ])
  )
  const ids = new Set<string>()
  for (const meet of meets) {
    for (const url of allMeetStoredUrls(meet)) ids.add(urlObjectId(url))
  }
  for (const set of standards) {
    if (set.sourceUrl) ids.add(urlObjectId(set.sourceUrl))
  }
  return ids
}

/** Bulk remove (the endpoint supabase-js `remove()` uses); returns the keys actually deleted. */
async function removeStoredObjects(bucket: string, paths: string[]): Promise<Set<string>> {
  const deleted = new Set<string>()
  if (paths.length === 0) return deleted
  const { url, key } = getSupabaseConfig()
  for (let i = 0; i < paths.length; i += 1000) {
    const res = await fetch(`${url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: storageHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: paths.slice(i, i + 1000) }),
    })
    if (!res.ok) throw await storageRequestError(res)
    const body = (await res.json().catch(() => [])) as unknown
    if (Array.isArray(body)) {
      for (const item of body) {
        const name = (item as { name?: unknown } | null)?.name
        if (typeof name === "string") deleted.add(name)
      }
    }
  }
  return deleted
}

/** Object keys directly inside `folder` (not recursive). */
async function listStoredFolder(bucket: string, folder: string): Promise<string[]> {
  const { url, key } = getSupabaseConfig()
  const paths: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: storageHeaders(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        prefix: folder,
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    })
    if (!res.ok) throw await storageRequestError(res)
    const items = (await res.json().catch(() => [])) as { name?: string; id?: string | null }[]
    if (!Array.isArray(items)) break
    for (const item of items) {
      // Sub-folders come back with a null id.
      if (item?.name && item.id) paths.push(`${folder}/${item.name}`)
    }
    if (items.length < 1000) break
  }
  return paths
}

/**
 * Delete the stored objects behind `urls` — but only those in our meet buckets,
 * on our storage host, that no meet (soft-deleted included) or Nationals
 * standards set still points at. External links are ignored.
 *
 * Non-strict (the default) never throws: the database write that dropped the
 * URL has already happened, so a storage hiccup is logged instead of turning a
 * saved change into an error. Strict throws, so a purge can retry later.
 */
export async function deleteUnreferencedStoredFiles(
  urls: Iterable<string | null | undefined>,
  options: { exceptMeetId?: string; strict?: boolean } = {}
): Promise<void> {
  const objects = new Map<string, StoredObject>()
  for (const url of urls) {
    const object = storedObjectFromUrl(url)
    if (object) objects.set(objectId(object), object)
  }
  if (objects.size === 0) return

  let referenced: Set<string>
  try {
    referenced = await referencedObjectIds(options.exceptMeetId)
  } catch (err) {
    if (options.strict) throw err
    console.error("Skipped deleting meet files — could not check references:", err)
    return
  }

  const byBucket = new Map<string, string[]>()
  for (const [id, object] of objects) {
    if (referenced.has(id)) continue
    const list = byBucket.get(object.bucket) ?? []
    list.push(object.path)
    byBucket.set(object.bucket, list)
  }

  const results = await Promise.allSettled(
    [...byBucket].map(async ([bucket, paths]) => {
      if (bucket === LOCAL_BUCKET) {
        await Promise.all(
          paths.map((p) => unlink(path.join(process.cwd(), "public", p)).catch(() => undefined))
        )
        return
      }
      const deleted = await removeStoredObjects(bucket, paths)
      const missing = paths.filter((p) => !deleted.has(p))
      if (missing.length > 0) {
        // Already gone, or the key differs from the URL — either way say so instead of passing silently.
        console.warn(`[meet-storage] Not found in ${bucket} (nothing deleted):`, missing)
      }
    })
  )
  for (const result of results) {
    if (result.status === "rejected") {
      if (options.strict) throw result.reason
      console.error("Failed to delete stored meet files:", result.reason)
    }
  }
}

/**
 * Delete one uploaded meet document (meet-files bucket or legacy local disk)
 * unless a meet still points at it. Throws on a storage error.
 */
export async function deleteStoredMeetFile(url: string | null | undefined) {
  const object = storedObjectFromUrl(url)
  if (!object || (object.bucket !== MEET_FILE_BUCKET && object.bucket !== LOCAL_BUCKET)) return
  await deleteUnreferencedStoredFiles([url], { strict: true })
}

/** Delete a parser-only copy in `parse-tmp/`; no reference check, nothing saves those URLs. */
export async function deleteTemporaryMeetFile(url: string | null | undefined) {
  const object = storedObjectFromUrl(url)
  if (!object || object.bucket !== MEET_FILE_BUCKET) return
  if (!object.path.startsWith(`${PARSE_TMP_FOLDER}/`)) return
  try {
    await removeStoredObjects(MEET_FILE_BUCKET, [object.path])
  } catch (err) {
    console.error("Failed to delete temporary parser copy:", err)
  }
}

/** The meet's stored-file fields after applying `after` (a partial update) to `before`. */
function withChanges(before: MeetStoredFiles, after: Record<string, unknown>): MeetStoredFiles {
  const merged: Record<string, unknown> = { ...before }
  for (const key of MEET_STORED_FIELDS) {
    if (key in after) merged[key] = after[key]
  }
  return merged as MeetStoredFiles
}

function urlsMissingFrom(urls: string[], keep: string[]): string[] {
  const kept = new Set(keep.map(urlObjectId))
  return urls.filter((url) => !kept.has(urlObjectId(url)))
}

/**
 * After a meet update, delete the files it no longer points at. Compares the
 * whole before/after file set, so a file kept in another field (the same PDF as
 * psych and heat sheet) is not deleted, and checks other meets before deleting.
 * Never throws — the update is already saved.
 */
export async function deleteRemovedMeetFiles(
  before: MeetStoredFiles,
  after: Record<string, unknown>
) {
  const removed = urlsMissingFrom(
    allMeetStoredUrls(before),
    allMeetStoredUrls(withChanges(before, after))
  )
  await deleteUnreferencedStoredFiles(removed)
}

/** After a rejected update, delete the files it would have added (fresh uploads nobody saved). */
export async function deleteAddedMeetFiles(
  before: MeetStoredFiles,
  after: Record<string, unknown>
) {
  const added = urlsMissingFrom(
    allMeetStoredUrls(withChanges(before, after)),
    allMeetStoredUrls(before)
  )
  await deleteUnreferencedStoredFiles(added)
}

/**
 * Purge: delete everything the meet points at plus anything left in its folder
 * (uploads that never got saved), except files another meet also points at.
 */
export async function deleteAllMeetFiles(meet: MeetStoredFiles, options?: { strict?: boolean }) {
  const urls = allMeetStoredUrls(meet)
  if (meet.id) {
    try {
      const { url: base } = getSupabaseConfig()
      const folderPaths = await listStoredFolder(MEET_FILE_BUCKET, meetFileFolder(meet.id))
      urls.push(...folderPaths.map((p) => publicStorageUrl(base, MEET_FILE_BUCKET, p)))
    } catch (err) {
      if (options?.strict) throw err
      console.error("Could not list meet folder for purge:", err)
    }
  }
  await deleteUnreferencedStoredFiles(urls, { exceptMeetId: meet.id, strict: options?.strict })
}

// ---------------------------------------------------------------------------
// Copies: meet image naming and adopting pending uploads
// ---------------------------------------------------------------------------

const MEET_IMAGES = [
  { key: "iconUrl", bucket: "meet-icons", folder: "icons", label: "icon" },
  { key: "bannerUrl", bucket: "meet-banners", folder: "banners", label: "banner" },
] as const

export type MeetImageNaming = {
  /** Delete the originals once the meet row points at the copies. */
  commit: () => Promise<void>
  /** Delete the copies when the meet save fails. */
  rollback: () => Promise<void>
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function copyStoredObject(
  url: string,
  key: string,
  bucket: string,
  sourceKey: string,
  destinationKey: string
) {
  const res = await fetch(`${url}/storage/v1/object/copy`, {
    method: "POST",
    headers: storageHeaders(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ bucketId: bucket, sourceKey, destinationKey }),
  })
  if (!res.ok) throw await storageRequestError(res)
}

/**
 * Point `data.iconUrl` / `data.bannerUrl` at copies named after the meet
 * (`icons/fall-invite-icon.png`, `banners/fall-invite-banner.jpg`). Covers
 * fresh uploads and, when the meet is renamed, its existing images. Naming is
 * cosmetic: a failed copy keeps the original URL.
 */
export async function nameMeetImages(
  data: Record<string, unknown>,
  existing?: { name: string; iconUrl: string | null; bannerUrl: string | null }
): Promise<MeetImageNaming> {
  const sources: string[] = []
  const copies: string[] = []
  const done = {
    // Reference-checked: by commit time the meet row points at the copies.
    commit: () => deleteUnreferencedStoredFiles(sources),
    rollback: () => deleteUnreferencedStoredFiles(copies),
  }

  const name = typeof data.name === "string" ? data.name : existing?.name
  if (!name) return done
  const renamed = !!existing && name !== existing.name

  for (const image of MEET_IMAGES) {
    const url = image.key in data ? data[image.key] : renamed ? existing[image.key] : null
    if (typeof url !== "string" || !url.trim()) continue
    const parsed = parsePublicStorageUrl(url)
    if (!parsed || parsed.bucket !== image.bucket) continue

    const ext = path.extname(parsed.path).toLowerCase()
    const base = `${meetSlugBase(name)}-${image.label}`
    const named = new RegExp(`^${image.folder}/${escapeRegExp(base)}(-\\d+)?${escapeRegExp(ext)}$`)
    if (named.test(parsed.path)) continue

    try {
      const { url: baseUrl, key } = getSupabaseConfig()
      let destination = `${image.folder}/${base}${ext}`
      for (let n = 2; await fileExists(baseUrl, key, destination, image.bucket); n++) {
        destination = `${image.folder}/${base}-${n}${ext}`
      }
      await copyStoredObject(baseUrl, key, image.bucket, parsed.path, destination)
      // Names get reused after a replace, so version the URL past browser/CDN caches.
      const copyUrl = `${baseUrl}/storage/v1/object/public/${image.bucket}/${destination}?v=${Date.now().toString(36)}`
      data[image.key] = copyUrl
      sources.push(url)
      copies.push(copyUrl)
    } catch (err) {
      console.error(`Failed to rename meet ${image.label}:`, err)
    }
  }

  return done
}

function mapHeatSheetLinks(value: unknown, move: (url: string) => string | null): unknown {
  if (!Array.isArray(value)) return value
  let changed = false
  const next = value.map((item) => {
    if (!item || typeof item !== "object") return item
    const url = (item as { url?: unknown }).url
    const moved = typeof url === "string" ? move(url) : null
    if (!moved) return item
    changed = true
    return { ...(item as Record<string, unknown>), url: moved }
  })
  return changed ? next : value
}

function mapPhotos(value: unknown, move: (url: string) => string | null): unknown {
  if (!value || typeof value !== "object") return value
  const mapItem = (item: unknown) => {
    if (typeof item === "string") return move(item) ?? item
    if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
      const moved = move((item as { url: string }).url)
      return moved ? { ...(item as Record<string, unknown>), url: moved } : item
    }
    return item
  }
  if (Array.isArray(value)) return value.map(mapItem)
  const obj = value as { previews?: unknown; links?: unknown }
  return {
    ...obj,
    ...(Array.isArray(obj.previews) ? { previews: obj.previews.map(mapItem) } : {}),
    ...(Array.isArray(obj.links) ? { links: obj.links.map(mapItem) } : {}),
  }
}

/** The meet's stored-file fields with each URL `move` maps replaced; only changed fields are returned. */
function rewriteMeetFileUrls(
  meet: MeetStoredFiles,
  move: (url: string) => string | null
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const key of MEET_FILE_URL_KEYS) {
    const url = meet[key]
    const moved = url ? move(url) : null
    if (moved) patch[key] = moved
  }
  for (const key of ["heatSheetUrls", "finalsHeatSheetUrls"] as const) {
    const next = mapHeatSheetLinks(meet[key], move)
    if (next !== meet[key]) patch[key] = next
  }
  const photos = mapPhotos(meet.photos, move)
  if (JSON.stringify(photos) !== JSON.stringify(meet.photos)) patch.photos = photos
  return patch
}

export type PendingMeetFileAdoption = {
  /** Fields to write so the meet points at the copies in its folder (null when nothing moved). */
  patch: Record<string, unknown> | null
  /** Delete the pending originals once the meet row points at the copies. */
  commit: () => Promise<void>
  /** Delete the copies when the meet row could not be updated. */
  rollback: () => Promise<void>
}

/**
 * Files uploaded before the meet existed (`pending/`, the create-meet form) are
 * copied into the meet's folder. Copy → save → delete originals, so the row
 * never points at a missing file; a failed copy keeps the pending URL working.
 */
export async function adoptPendingMeetFiles(
  meet: MeetStoredFiles & { id: string }
): Promise<PendingMeetFileAdoption> {
  /** Pending object id → URL of its copy in the meet folder. */
  const moved = new Map<string, string>()
  const sources: string[] = []
  const copies: string[] = []
  const result: PendingMeetFileAdoption = {
    patch: null,
    commit: () => deleteUnreferencedStoredFiles(sources),
    rollback: () => deleteUnreferencedStoredFiles(copies),
  }

  for (const url of allMeetStoredUrls(meet)) {
    const object = storedObjectFromUrl(url)
    if (!object || object.bucket !== MEET_FILE_BUCKET) continue
    if (!object.path.startsWith(`${PENDING_MEET_FILE_FOLDER}/`)) continue
    const id = objectId(object)
    if (moved.has(id)) continue
    try {
      const { url: base, key } = getSupabaseConfig()
      const name = object.path.slice(object.path.lastIndexOf("/") + 1)
      const dot = name.lastIndexOf(".")
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ""
      let destination: string | null = null
      for (let n = 0; n <= 100 && !destination; n++) {
        const candidate = `${meetFileFolder(meet.id)}/${numberedName(stem, ext, n)}`
        try {
          await copyStoredObject(base, key, MEET_FILE_BUCKET, object.path, candidate)
          destination = candidate
        } catch (err) {
          if (!(err instanceof StorageRequestError && err.duplicate)) throw err
        }
      }
      if (!destination) continue
      const copyUrl = publicStorageUrl(base, MEET_FILE_BUCKET, destination)
      moved.set(id, copyUrl)
      sources.push(url)
      copies.push(copyUrl)
    } catch (err) {
      console.error("Failed to move pending meet file into its folder:", err)
    }
  }

  if (moved.size > 0) {
    result.patch = rewriteMeetFileUrls(meet, (url) => moved.get(urlObjectId(url)) ?? null)
  }
  return result
}
