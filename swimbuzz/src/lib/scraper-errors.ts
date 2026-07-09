export function parseScraperError(body: unknown, fallback: string): string {
  if (typeof body === "string") {
    const trimmed = body.trim()
    if (!trimmed) return fallback
    try {
      return parseScraperError(JSON.parse(trimmed), fallback)
    } catch {
      return trimmed
    }
  }

  if (!body || typeof body !== "object") return fallback

  const record = body as Record<string, unknown>

  if (typeof record.detail === "string") return record.detail

  if (Array.isArray(record.detail)) {
    const messages = record.detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item
          ? String((item as { msg?: string }).msg ?? "")
          : ""
      )
      .filter(Boolean)
    if (messages.length > 0) return messages.join(", ")
  }

  if (typeof record.error === "string") return record.error

  return fallback
}
