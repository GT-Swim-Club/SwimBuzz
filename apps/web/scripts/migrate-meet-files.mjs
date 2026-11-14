/**
 * Move meet files from the flat `uploads/` (and `pending/`) layout of the
 * `meet-files` bucket into one folder per meet — `meets/<meetId>/<name>` — and
 * rewrite every stored URL that points at them: the meet URL fields
 * (packet, psych/heat/entries sheets, results, travel), the heat-sheet and
 * finals heat-sheet JSON lists, photo galleries, and Nationals standards
 * `sourceUrl` (moved to `nationals/`). Soft-deleted meets are included.
 *
 * Also reports orphans: objects in the bucket nothing points at.
 *
 *   node scripts/migrate-meet-files.mjs                      # dry run: print the plan, change nothing
 *   node scripts/migrate-meet-files.mjs --apply              # copy, rewrite URLs, then delete the originals
 *   node scripts/migrate-meet-files.mjs --apply --keep-originals   # copy + rewrite, leave originals in place
 *   node scripts/migrate-meet-files.mjs --apply --delete-orphans   # also delete orphans older than 24h
 *
 * Order per file: copy → update every row that points at it → delete the
 * original, so a row never points at a missing object. A failed copy leaves
 * that file and its URLs untouched. Needs DATABASE_URL, SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (read from apps/web/.env when present).
 */
import path from "node:path"
import { PrismaClient } from "@prisma/client"

try {
  process.loadEnvFile?.(path.resolve(import.meta.dirname, "../.env"))
} catch {
  // Use the environment as is.
}

const BUCKET = "meet-files"
const APPLY = process.argv.includes("--apply")
const KEEP_ORIGINALS = process.argv.includes("--keep-originals")
const DELETE_ORPHANS = process.argv.includes("--delete-orphans")
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000
const SCALAR_FIELDS = [
  "packetUrl",
  "entriesSheetUrl",
  "psychSheetUrl",
  "heatSheetUrl",
  "resultsUrl",
  "rideSignUpsUrl",
  "roomsUrl",
]
const LIST_FIELDS = ["heatSheetUrls", "finalsHeatSheetUrls"]

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "")
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const STORAGE_HOST = new URL(SUPABASE_URL).hostname

// A plain client on purpose: it skips the app's soft-delete filter, so deleted meets
// (which keep their files until purge) are migrated too.
const prisma = new PrismaClient()

const headers = (extra = {}) => ({ Authorization: `Bearer ${KEY}`, apikey: KEY, ...extra })
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/")
const publicUrl = (p) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodePath(p)}`

/** Same rule as safeStorageFileName in lib/meet/meet-storage.ts. */
function safeFileName(name) {
  const rawExt = path.extname(name)
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10)
  const base = path
    .basename(name, rawExt)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._()-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .replace(/^[\s.-]+|[\s.-]+$/g, "")
    .slice(0, 100)
  return { base: base || "file", ext: ext === "." ? "" : ext }
}

/** Object key in our meet-files bucket for a URL, or null (external, other bucket, other host). */
function objectPath(url) {
  if (typeof url !== "string") return null
  const trimmed = url.trim()
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = trimmed.indexOf(marker)
  if (idx === -1) return null
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      if (new URL(trimmed).hostname !== STORAGE_HOST) return null
    } catch {
      return null
    }
  }
  const raw = trimmed.slice(idx + marker.length).split("?")[0].split("#")[0]
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function photoUrls(photos) {
  const urls = []
  const add = (item) => {
    if (typeof item === "string") urls.push(item)
    else if (item && typeof item === "object" && typeof item.url === "string") urls.push(item.url)
  }
  if (Array.isArray(photos)) photos.forEach(add)
  else if (photos && typeof photos === "object") {
    if (Array.isArray(photos.previews)) photos.previews.forEach(add)
    if (Array.isArray(photos.links)) photos.links.forEach(add)
  }
  return urls
}

function meetUrls(meet) {
  const urls = SCALAR_FIELDS.map((f) => meet[f])
  for (const f of LIST_FIELDS) {
    if (Array.isArray(meet[f])) for (const link of meet[f]) urls.push(link?.url)
  }
  urls.push(...photoUrls(meet.photos))
  return urls.filter((u) => typeof u === "string" && u.trim())
}

/** Changed fields of `meet` with each URL `map` returns a new value for. */
function rewriteMeet(meet, map) {
  const patch = {}
  const swap = (url) => (typeof url === "string" ? map(url) : null)
  for (const f of SCALAR_FIELDS) {
    const next = swap(meet[f])
    if (next) patch[f] = next
  }
  for (const f of LIST_FIELDS) {
    if (!Array.isArray(meet[f])) continue
    let changed = false
    const next = meet[f].map((link) => {
      const url = swap(link?.url)
      if (!url) return link
      changed = true
      return { ...link, url }
    })
    if (changed) patch[f] = next
  }
  const mapItem = (item) => {
    if (typeof item === "string") return swap(item) ?? item
    if (item && typeof item === "object" && typeof item.url === "string") {
      const url = swap(item.url)
      return url ? { ...item, url } : item
    }
    return item
  }
  const photos = meet.photos
  let nextPhotos = photos
  if (Array.isArray(photos)) nextPhotos = photos.map(mapItem)
  else if (photos && typeof photos === "object") {
    nextPhotos = {
      ...photos,
      ...(Array.isArray(photos.previews) ? { previews: photos.previews.map(mapItem) } : {}),
      ...(Array.isArray(photos.links) ? { links: photos.links.map(mapItem) } : {}),
    }
  }
  if (JSON.stringify(nextPhotos) !== JSON.stringify(photos)) patch.photos = nextPhotos
  return patch
}

async function storageCall(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`${res.status} ${body.message ?? body.error ?? res.statusText}`)
  }
  return res.json().catch(() => null)
}

/** Every object in the bucket: key → created_at. */
async function listAllObjects(prefix = "", out = new Map()) {
  for (let offset = 0; ; offset += 1000) {
    const items = await storageCall(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    })
    if (!Array.isArray(items)) break
    for (const item of items) {
      const key = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id) out.set(key, item.created_at ? new Date(item.created_at) : null)
      else await listAllObjects(key, out)
    }
    if (items.length < 1000) break
  }
  return out
}

const copyObject = (sourceKey, destinationKey) =>
  storageCall(`${SUPABASE_URL}/storage/v1/object/copy`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ bucketId: BUCKET, sourceKey, destinationKey }),
  })

async function removeObjects(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    await storageCall(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: keys.slice(i, i + 1000) }),
    })
  }
}

async function main() {
  console.log(APPLY ? "APPLY — writing changes" : "DRY RUN — nothing will change (pass --apply to write)")

  const [meets, standards, objects] = await Promise.all([
    prisma.meet.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        ...Object.fromEntries([...SCALAR_FIELDS, ...LIST_FIELDS, "photos"].map((f) => [f, true])),
      },
    }),
    prisma.nationalsStandardSet.findMany({ select: { id: true, season: true, course: true, sourceUrl: true } }),
    listAllObjects(),
  ])
  console.log(`${meets.length} meets, ${standards.length} Nationals standards sets, ${objects.size} objects in ${BUCKET}`)

  // object key → rows that point at it
  const owners = new Map()
  const addOwner = (key, owner) => {
    const list = owners.get(key) ?? []
    if (!list.some((o) => o.kind === owner.kind && o.id === owner.id)) list.push(owner)
    owners.set(key, list)
  }
  for (const meet of meets) {
    for (const url of meetUrls(meet)) {
      const key = objectPath(url)
      if (key) addOwner(key, { kind: "meet", id: meet.id, label: meet.name, deleted: Boolean(meet.deletedAt) })
    }
  }
  for (const set of standards) {
    const key = objectPath(set.sourceUrl)
    if (key) addOwner(key, { kind: "nationals", id: set.id, label: `${set.season} ${set.course}` })
  }

  // Plan the moves.
  const taken = new Set(objects.keys())
  const moves = new Map() // source key → destination key
  const missing = []
  const shared = []
  for (const [key, list] of owners) {
    const meetOwners = list.filter((o) => o.kind === "meet")
    let folder
    if (meetOwners.length > 0) {
      if (meetOwners.some((o) => key.startsWith(`meets/${o.id}/`))) continue
      // Oldest meet that points at it owns it; the others are rewritten to the same URL.
      folder = `meets/${meetOwners[0].id}`
      if (list.length > 1) shared.push({ key, owners: list })
    } else {
      if (key.startsWith("nationals/")) continue
      folder = "nationals"
    }
    if (!objects.has(key)) {
      missing.push({ key, owners: list })
      continue
    }
    const { base, ext } = safeFileName(key.slice(key.lastIndexOf("/") + 1))
    let destination = `${folder}/${base}${ext}`
    for (let n = 1; taken.has(destination); n++) destination = `${folder}/${base} (${n})${ext}`
    taken.add(destination)
    moves.set(key, destination)
  }

  for (const [from, to] of moves) {
    const who = owners.get(from).map((o) => `${o.kind === "meet" ? "" : "nationals "}${o.label}${o.deleted ? " (deleted)" : ""}`)
    console.log(`MOVE  ${from}  →  ${to}   [${who.join("; ")}]`)
  }
  for (const { key, owners: list } of shared) {
    console.log(`SHARED ${key} is used by ${list.length} rows: ${list.map((o) => o.label).join("; ")} — moved once, all rewritten`)
  }
  for (const { key, owners: list } of missing) {
    console.log(`MISSING ${key} (not in the bucket; URLs left as is) — ${list.map((o) => o.label).join("; ")}`)
  }

  // Orphans: objects nothing points at (judged on the layout after the moves).
  const referenced = new Set([...owners.keys()].map((k) => moves.get(k) ?? k))
  const now = Date.now()
  const orphans = [...objects]
    .filter(([key]) => !referenced.has(key) && !moves.has(key))
    .map(([key, createdAt]) => ({ key, createdAt, old: !createdAt || now - createdAt.getTime() > ORPHAN_MIN_AGE_MS }))
  for (const o of orphans) {
    console.log(`ORPHAN ${o.key}${o.createdAt ? ` (uploaded ${o.createdAt.toISOString()})` : ""}${o.old ? "" : " — under 24h old, kept"}`)
  }

  console.log(
    `\nPlan: ${moves.size} moves, ${shared.length} shared, ${missing.length} missing, ${orphans.length} orphans` +
      ` (${orphans.filter((o) => o.old).length} older than 24h)`
  )
  if (!APPLY) return

  // 1. Copy.
  const copied = new Map()
  for (const [from, to] of moves) {
    try {
      await copyObject(from, to)
      copied.set(from, to)
    } catch (err) {
      console.error(`COPY FAILED ${from} → ${to}: ${err.message}`)
    }
  }
  const swap = (url) => {
    const key = objectPath(url)
    const to = key ? copied.get(key) : null
    return to ? publicUrl(to) : null
  }

  // 2. Rewrite every row that points at a copied file.
  const failedKeys = new Set()
  let updatedMeets = 0
  for (const meet of meets) {
    const patch = rewriteMeet(meet, swap)
    if (Object.keys(patch).length === 0) continue
    try {
      await prisma.meet.update({ where: { id: meet.id }, data: patch })
      updatedMeets++
    } catch (err) {
      console.error(`UPDATE FAILED meet ${meet.id} (${meet.name}): ${err.message}`)
      for (const url of meetUrls(meet)) {
        const key = objectPath(url)
        if (key) failedKeys.add(key)
      }
    }
  }
  let updatedSets = 0
  for (const set of standards) {
    const next = swap(set.sourceUrl)
    if (!next) continue
    try {
      await prisma.nationalsStandardSet.update({ where: { id: set.id }, data: { sourceUrl: next } })
      updatedSets++
    } catch (err) {
      console.error(`UPDATE FAILED standards ${set.id}: ${err.message}`)
      failedKeys.add(objectPath(set.sourceUrl))
    }
  }
  console.log(`Copied ${copied.size} files, updated ${updatedMeets} meets and ${updatedSets} standards sets`)

  // 3. Delete originals no row points at any more.
  if (!KEEP_ORIGINALS) {
    const originals = [...copied.keys()].filter((key) => !failedKeys.has(key))
    try {
      await removeObjects(originals)
      console.log(`Deleted ${originals.length} originals`)
    } catch (err) {
      console.error(`DELETE FAILED for originals: ${err.message}`)
    }
  }

  if (DELETE_ORPHANS) {
    const old = orphans.filter((o) => o.old).map((o) => o.key)
    try {
      await removeObjects(old)
      console.log(`Deleted ${old.length} orphans`)
    } catch (err) {
      console.error(`DELETE FAILED for orphans: ${err.message}`)
    }
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
