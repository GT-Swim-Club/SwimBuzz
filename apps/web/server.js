const { randomBytes } = require("node:crypto")
const { createServer } = require("node:http")
const { parse } = require("node:url")
const next = require("next")
const compression = require("compression")
const { startSignupMonitor } = require("./signup-status-monitor")
const { startNotificationCleanupMonitor } = require("./notification-cleanup-monitor")
const { startStaffTermExpiryMonitor } = require("./staff-term-expiry-monitor")

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

    // Start the signup status monitor
    startSignupMonitor()
    // Start the notification cleanup monitor
    startNotificationCleanupMonitor()
    // Start the staff term expiry monitor
    startStaffTermExpiryMonitor()
  })
})
