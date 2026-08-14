import path from "path"

export function resolvedFileExt(
  file: { name: string; type: string },
  allowed: Set<string>,
  mimeByExt: Record<string, string>
): string | null {
  const ext = path.extname(file.name.split(/[?#]/)[0]).toLowerCase()
  if (allowed.has(ext)) return ext

  const type = file.type.toLowerCase().split(";")[0].trim()
  if (type === "image/jpg" || type === "image/jpeg") {
    if (allowed.has(".jpg")) return ".jpg"
    if (allowed.has(".jpeg")) return ".jpeg"
  }
  for (const [candidate, mime] of Object.entries(mimeByExt)) {
    if (mime === type && allowed.has(candidate)) return candidate
  }
  return null
}
