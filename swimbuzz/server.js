const { createServer } = require("node:http")
const { parse } = require("node:url")
const next = require("next")

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

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
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

  server.requestTimeout = REQUEST_TIMEOUT_MS
  server.headersTimeout = REQUEST_TIMEOUT_MS + 60_000

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
    if (REQUEST_TIMEOUT_MS > 0) {
      console.log(`> HTTP request timeout: ${REQUEST_TIMEOUT_MS / 1000}s`)
    } else {
      console.log("> HTTP request timeout: disabled")
    }
  })
})
