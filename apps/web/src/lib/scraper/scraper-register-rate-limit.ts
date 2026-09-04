const WINDOW_MS = 15 * 60 * 1000 // matches PAIRING_TTL_MS in scraper.ts
const MAX_ATTEMPTS_PER_WINDOW = 10

type ScraperRegisterRateLimit =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

/**
 * Pairing codes are 6 digits (~900k possibilities) over a 15-minute TTL, so
 * an unthrottled register endpoint is brute-forceable. In-memory per-IP
 * throttling is best-effort on serverless (state resets on cold start and
 * isn't shared across instances), but it's enough to defeat a naive
 * single-connection brute-force loop without adding a persistent datastore
 * for what's otherwise a low-traffic internal endpoint.
 */
const attemptsByIp = new Map<string, number[]>()

function clientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for")
  return forwardedFor?.split(",")[0]?.trim() || "unknown"
}

export function checkScraperRegisterRateLimit(req: Request): ScraperRegisterRateLimit {
  const ip = clientIp(req)
  const now = Date.now()
  const recent = (attemptsByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)

  if (recent.length >= MAX_ATTEMPTS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000))
    attemptsByIp.set(ip, recent)
    return { allowed: false, retryAfterSeconds }
  }

  recent.push(now)
  attemptsByIp.set(ip, recent)
  return { allowed: true }
}
