const { randomBytes } = require("node:crypto")
const { createServer } = require("node:http")
const { parse } = require("node:url")
const next = require("next")
const compression = require("compression")

// Dev / optional long-lived process only. Production on Vercel uses stock
// `next start` (see package.json `start`) plus HTTP cron routes.
const dev = process.env.NODE_ENV !== "production"
const hostname = process.env.HOSTNAME ?? "0.0.0.0"
const port = parseInt(process.env.PORT ?? "3000", 10)

// Node's default requestTimeout is 5 minutes — too short for bulk SwimCloud sync.
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.HTTP_REQUEST_TIMEOUT_MS ?? String(60 * 60 * 1000),
  10
)

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

// The same routes Vercel Cron / the external minutely cron hit in production,
// called on a timer so this long-lived process runs them in-process.
const CRON_JOBS = [
  { path: "/api/cron/signup-monitor", intervalMs: MINUTE_MS },
  { path: "/api/cron/notification-cleanup", intervalMs: DAY_MS },
  { path: "/api/cron/staff-term-expiry", intervalMs: DAY_MS },
]

async function runCron(path) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    if (!response.ok) throw new Error(`returned ${response.status}`)
  } catch (error) {
    console.error(`[cron] ${path} failed:`, error)
  }
}

function startCrons() {
  for (const { path, intervalMs } of CRON_JOBS) {
    void runCron(path)
    setInterval(() => void runCron(path), intervalMs)
  }
}

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()
const compress = compression()

app.prepare().then(() => {
  // Next has loaded .env; preserve its cron secret or generate one for this process.
  process.env.CRON_SECRET ||= randomBytes(32).toString("hex")
  const server = createServer((req, res) => {
    compress(req, res, async () => {
      try {
        const parsedUrl = parse(req.url, true)
        await handle(req, res, parsedUrl)
      } catch (err) {
        console.error("Error handling request:", err)
        if (!res.headersSent) {
          res.statusCode = 500
          res.end("Internal server error")
        }
      }
    })
  })

  server.requestTimeout = REQUEST_TIMEOUT_MS
  server.headersTimeout = REQUEST_TIMEOUT_MS + 60_000

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    if (REQUEST_TIMEOUT_MS > 0) {
      console.log(`> HTTP request timeout: ${REQUEST_TIMEOUT_MS / 1000}s`)
    } else {
      console.log("> HTTP request timeout: disabled")
    }

    startCrons()
  })
})
