import { Agent, fetch as undiciFetch } from "undici"

const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://localhost:8000"

/** Node's default fetch times out after 5 minutes; bulk SwimCloud sync can take much longer. */
const SCRAPER_FETCH_TIMEOUT_MS = parseInt(
  process.env.SCRAPER_FETCH_TIMEOUT_MS ?? String(60 * 60 * 1000),
  10
)

const scraperAgent = new Agent({
  headersTimeout: SCRAPER_FETCH_TIMEOUT_MS,
  bodyTimeout: SCRAPER_FETCH_TIMEOUT_MS,
  connectTimeout: 30_000,
})

export { SCRAPER_URL }

export function fetchScraper(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  return undiciFetch(input, {
    ...init,
    dispatcher: scraperAgent,
  } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>
}
