export type EventOrderRow = {
  women: number | null
  event: string
  men: number | null
}

export type EventOrderSession = {
  label: string
  rows: EventOrderRow[]
}

export type EventOrder = {
  sessions: EventOrderSession[]
}

export function isEventOrder(value: unknown): value is EventOrder {
  if (!value || typeof value !== "object") return false
  const sessions = (value as EventOrder).sessions
  if (!Array.isArray(sessions)) return false
  return sessions.every(
    (s) =>
      typeof s.label === "string" &&
      Array.isArray(s.rows) &&
      s.rows.every(
        (r) =>
          typeof r.event === "string" &&
          (r.women === null || typeof r.women === "number") &&
          (r.men === null || typeof r.men === "number")
      )
  )
}

export function cleanEventName(name: string): string {
  return name.replace(/[*^†‡]+(?:\s*)$/u, "").trim()
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

/** Whether we should try to download and parse this packet reference. */
export function isParsablePacketUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.startsWith("/meet-files/")) return true
  return isHttpUrl(url)
}

/** @deprecated Prefer isParsablePacketUrl — kept for callers that only need the extension check. */
export function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase().split("?")[0]
  return lower.endsWith(".pdf")
}
