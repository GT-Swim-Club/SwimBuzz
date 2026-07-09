import { prisma } from "@/lib/prisma"
import { isBridgeConnectionAlive, touchBridgeConnection } from "@/lib/bridge"

export async function getBridgeConnectionFromRequest(req: Request) {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) {
    return null
  }

  const token = auth.slice("Bearer ".length).trim()
  if (!token) {
    return null
  }

  const connection = await prisma.bridgeConnection.findUnique({ where: { token } })
  if (!connection) {
    return null
  }

  await touchBridgeConnection(connection.id)
  return connection
}

export async function requireBridgeConnection(req: Request) {
  const connection = await getBridgeConnectionFromRequest(req)
  if (!connection) {
    return { connection: null, error: "Unauthorized" as const }
  }
  return { connection, error: null }
}
