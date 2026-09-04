import { prisma } from "@/lib/prisma"
import { isScraperConnectionAlive, touchScraperConnection } from "@/lib/scraper/scraper"

export async function getScraperConnectionFromRequest(req: Request) {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return null
  }

  const token = auth.slice("Bearer ".length).trim()
  if (!token) {
    return null
  }

  const connection = await prisma.scraperConnection.findUnique({ where: { token } })
  if (!connection) {
    return null
  }

  if (!isScraperConnectionAlive(connection.lastSeenAt)) {
    await prisma.scraperConnection.delete({ where: { id: connection.id } }).catch(() => undefined)
    return null
  }

  await touchScraperConnection(connection.id)
  return connection
}

export async function requireScraperConnection(req: Request) {
  const connection = await getScraperConnectionFromRequest(req)
  if (!connection) {
    return { connection: null, error: "Unauthorized" as const }
  }
  return { connection, error: null }
}
