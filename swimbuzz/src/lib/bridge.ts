import { randomInt, randomUUID } from "crypto"
import { BridgeJobStatus, BridgeJobType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function isPrismaUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
}

const PAIRING_TTL_MS = 15 * 60 * 1000
/** Must exceed heartbeat interval (15s) and long-poll window (~25s). */
const CONNECTION_TTL_MS = 45 * 1000
const JOB_WAIT_MS = 20 * 60 * 1000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function generatePairingCode() {
  return String(randomInt(100_000, 1_000_000))
}

export function isBridgeConnectionAlive(lastSeenAt: Date) {
  return Date.now() - lastSeenAt.getTime() <= CONNECTION_TTL_MS
}

export async function getActiveBridgeConnection(userId: string) {
  const connection = await prisma.bridgeConnection.findFirst({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  })
  if (!connection) return null
  if (!isBridgeConnectionAlive(connection.lastSeenAt)) {
    await prisma.bridgeConnection.delete({ where: { id: connection.id } }).catch(() => undefined)
    return null
  }
  return connection
}

export async function createBridgePairing(userId: string) {
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS)

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePairingCode()
    try {
      const pairing = await prisma.bridgePairing.create({
        data: { userId, code, expiresAt },
      })
      return pairing
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err
    }
  }

  throw new Error("Could not generate pairing code")
}

export async function registerBridgeConnection(code: string) {
  const pairing = await prisma.bridgePairing.findUnique({ where: { code } })
  if (!pairing) {
    throw new Error("Invalid pairing code")
  }
  if (pairing.expiresAt.getTime() < Date.now()) {
    throw new Error("Pairing code expired")
  }

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")

  return prisma.$transaction(async (tx) => {
    await tx.bridgePairing.delete({
      where: { id: pairing.id },
    })

    await tx.bridgeConnection.deleteMany({ where: { userId: pairing.userId } })

    return tx.bridgeConnection.create({
      data: {
        userId: pairing.userId,
        token,
        lastSeenAt: new Date(),
      },
    })
  })
}

export async function touchBridgeConnection(connectionId: string) {
  await prisma.bridgeConnection.update({
    where: { id: connectionId },
    data: { lastSeenAt: new Date() },
  })
}

export async function disconnectBridge(userId: string) {
  await prisma.$transaction([
    prisma.bridgeJob.updateMany({
      where: {
        userId,
        status: { in: [BridgeJobStatus.PENDING, BridgeJobStatus.RUNNING] },
      },
      data: {
        status: BridgeJobStatus.FAILED,
        error: "Scraper terminated from the app",
        completedAt: new Date(),
      },
    }),
    prisma.bridgeConnection.deleteMany({ where: { userId } }),
  ])
}

export async function disconnectBridgeByToken(token: string) {
  const connection = await prisma.bridgeConnection.findUnique({ where: { token } })
  if (!connection) return
  await disconnectBridge(connection.userId)
}

export async function createBridgeJob(
  userId: string,
  connectionId: string,
  type: BridgeJobType,
  payload: Prisma.InputJsonValue
) {
  return prisma.bridgeJob.create({
    data: {
      userId,
      connectionId,
      type,
      payload,
      status: BridgeJobStatus.PENDING,
    },
  })
}

export async function claimNextBridgeJob(connectionId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.bridgeJob.findFirst({
      where: { connectionId, status: BridgeJobStatus.PENDING },
      orderBy: { createdAt: "asc" },
    })
    if (!job) return null

    return tx.bridgeJob.update({
      where: { id: job.id },
      data: {
        status: BridgeJobStatus.RUNNING,
        startedAt: new Date(),
      },
    })
  })
}

export async function completeBridgeJob(jobId: string, connectionId: string, result: unknown) {
  const job = await prisma.bridgeJob.findUnique({ where: { id: jobId } })
  if (!job || job.connectionId !== connectionId) {
    throw new Error("Job not found")
  }
  if (job.status !== BridgeJobStatus.RUNNING) {
    throw new Error("Job is not running")
  }

  return prisma.bridgeJob.update({
    where: { id: jobId },
    data: {
      status: BridgeJobStatus.COMPLETED,
      result: result as object,
      completedAt: new Date(),
    },
  }).then((job) => {
    setTimeout(
      () => prisma.bridgeJob.delete({ where: { id: jobId } }).catch(() => undefined),
      5000
    )
    return job
  })
}

export async function failBridgeJob(jobId: string, connectionId: string, error: string) {
  const job = await prisma.bridgeJob.findUnique({ where: { id: jobId } })
  if (!job || job.connectionId !== connectionId) {
    throw new Error("Job not found")
  }
  if (job.status !== BridgeJobStatus.RUNNING && job.status !== BridgeJobStatus.PENDING) {
    throw new Error("Job already finished")
  }

  return prisma.bridgeJob.update({
    where: { id: jobId },
    data: {
      status: BridgeJobStatus.FAILED,
      error,
      completedAt: new Date(),
    },
  }).then((job) => {
    setTimeout(
      () => prisma.bridgeJob.delete({ where: { id: jobId } }).catch(() => undefined),
      5000
    )
    return job
  })
}

export async function waitForBridgeJob(jobId: string, timeoutMs = JOB_WAIT_MS) {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const job = await prisma.bridgeJob.findUnique({ where: { id: jobId } })
    if (!job) {
      throw new Error("Bridge job not found")
    }
    if (job.status === BridgeJobStatus.COMPLETED) {
      return job
    }
    if (job.status === BridgeJobStatus.FAILED) {
      throw new Error(job.error ?? "Run scraper failed")
    }
    await sleep(1000)
  }

  await prisma.bridgeJob.update({
    where: { id: jobId },
    data: {
      status: BridgeJobStatus.FAILED,
      error: "Timed out waiting for your computer to finish the sync",
      completedAt: new Date(),
    },
  })

  throw new Error(
    "Timed out waiting for your computer. Keep the bridge running and complete any Cloudflare check in the browser."
  )
}

export const LOCAL_BRIDGE_HINT =
  "The scraper is not running. Open Run Scraper, install it on your computer if needed, and run the command."

export async function runBridgeJob<T>(
  userId: string,
  type: BridgeJobType,
  payload: Prisma.InputJsonValue
): Promise<T> {
  const connection = await getActiveBridgeConnection(userId)
  if (!connection) {
    throw new Error("LOCAL_BRIDGE_NOT_CONNECTED")
  }

  const job = await createBridgeJob(userId, connection.id, type, payload)
  const finished = await waitForBridgeJob(job.id)
  return finished.result as T
}
