import { randomInt, randomUUID } from "crypto"
import { ScraperJobStatus, ScraperJobType, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function isPrismaUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
}

const PAIRING_TTL_MS = 15 * 60 * 1000
/** Must exceed heartbeat interval (15s) and long-poll window (~25s). */
const CONNECTION_TTL_MS = 45 * 1000
/** Local/dev wait only — never use on Vercel (Hobby max 300s). */
const JOB_WAIT_MS = 20 * 60 * 1000
/** Safe upper bound when SCRAPER_SYNC_WAIT=1 on a long-lived Node server. */
const VERCEL_SAFE_WAIT_MS = 240_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function generatePairingCode() {
  return String(randomInt(100_000, 1_000_000))
}

export type ScraperApplyContext = Prisma.InputJsonValue

export function isScraperConnectionAlive(lastSeenAt: Date) {
  return Date.now() - lastSeenAt.getTime() <= CONNECTION_TTL_MS
}

export async function getActiveScraperConnection(userId: string) {
  const connection = await prisma.scraperConnection.findFirst({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
  })
  if (!connection) return null
  if (!isScraperConnectionAlive(connection.lastSeenAt)) {
    await prisma.scraperConnection.delete({ where: { id: connection.id } }).catch(() => undefined)
    return null
  }
  return connection
}

export async function createScraperPairing(userId: string) {
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS)

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePairingCode()
    try {
      const pairing = await prisma.scraperPairing.create({
        data: { userId, code, expiresAt },
      })
      return pairing
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err
    }
  }

  throw new Error("Could not generate pairing code")
}

export async function registerScraperConnection(code: string) {
  const pairing = await prisma.scraperPairing.findUnique({ where: { code } })
  if (!pairing) {
    throw new Error("Invalid pairing code")
  }
  if (pairing.expiresAt.getTime() < Date.now()) {
    throw new Error("Pairing code expired")
  }

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "")

  return prisma.$transaction(async (tx) => {
    await tx.scraperPairing.delete({
      where: { id: pairing.id },
    })

    await tx.scraperConnection.deleteMany({ where: { userId: pairing.userId } })

    return tx.scraperConnection.create({
      data: {
        userId: pairing.userId,
        token,
        lastSeenAt: new Date(),
      },
    })
  })
}

export async function touchScraperConnection(connectionId: string) {
  await prisma.scraperConnection.update({
    where: { id: connectionId },
    data: { lastSeenAt: new Date() },
  })
}

export async function disconnectScraper(userId: string) {
  await prisma.$transaction([
    prisma.scraperJob.updateMany({
      where: {
        userId,
        status: { in: [ScraperJobStatus.PENDING, ScraperJobStatus.RUNNING] },
      },
      data: {
        status: ScraperJobStatus.FAILED,
        error: "Scraper terminated from the app",
        completedAt: new Date(),
      },
    }),
    prisma.scraperConnection.deleteMany({ where: { userId } }),
  ])
}

export async function disconnectScraperByToken(token: string) {
  const connection = await prisma.scraperConnection.findUnique({ where: { token } })
  if (!connection) return
  await disconnectScraper(connection.userId)
}

export async function createScraperJob(
  userId: string,
  connectionId: string,
  type: ScraperJobType,
  payload: Prisma.InputJsonValue,
  applyContext?: ScraperApplyContext | null
) {
  return prisma.scraperJob.create({
    data: {
      userId,
      connectionId,
      type,
      payload,
      status: ScraperJobStatus.PENDING,
      ...(applyContext != null ? { applyContext } : {}),
    },
  })
}

/** Enqueue a job for the desktop scraper; returns immediately with the job id. */
export async function enqueueScraperJob(
  userId: string,
  type: ScraperJobType,
  payload: Prisma.InputJsonValue,
  applyContext?: ScraperApplyContext | null
) {
  const connection = await getActiveScraperConnection(userId)
  if (!connection) {
    throw new Error("LOCAL_BRIDGE_NOT_CONNECTED")
  }
  return createScraperJob(userId, connection.id, type, payload, applyContext)
}

export async function claimNextScraperJob(connectionId: string) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.scraperJob.findFirst({
      where: { connectionId, status: ScraperJobStatus.PENDING },
      orderBy: { createdAt: "asc" },
    })
    if (!job) return null

    return tx.scraperJob.update({
      where: { id: job.id },
      data: {
        status: ScraperJobStatus.RUNNING,
        startedAt: new Date(),
      },
    })
  })
}

export async function completeScraperJob(jobId: string, connectionId: string, result: unknown) {
  const job = await prisma.scraperJob.findUnique({ where: { id: jobId } })
  if (!job || job.connectionId !== connectionId) {
    throw new Error("Job not found")
  }
  if (job.status !== ScraperJobStatus.RUNNING) {
    throw new Error("Job is not running")
  }

  // Persist result for client poll + finalize (do not auto-delete).
  return prisma.scraperJob.update({
    where: { id: jobId },
    data: {
      status: ScraperJobStatus.COMPLETED,
      result: result as object,
      completedAt: new Date(),
    },
  })
}

export async function failScraperJob(jobId: string, connectionId: string, error: string) {
  const job = await prisma.scraperJob.findUnique({ where: { id: jobId } })
  if (!job || job.connectionId !== connectionId) {
    throw new Error("Job not found")
  }
  if (job.status !== ScraperJobStatus.RUNNING && job.status !== ScraperJobStatus.PENDING) {
    throw new Error("Job already finished")
  }

  return prisma.scraperJob.update({
    where: { id: jobId },
    data: {
      status: ScraperJobStatus.FAILED,
      error,
      completedAt: new Date(),
    },
  })
}

export async function getScraperJobForUser(jobId: string, userId: string) {
  return prisma.scraperJob.findFirst({
    where: { id: jobId, userId },
  })
}

export async function markScraperJobApplied(
  jobId: string,
  applyResult: Prisma.InputJsonValue
) {
  return prisma.scraperJob.update({
    where: { id: jobId },
    data: {
      appliedAt: new Date(),
      applyResult,
    },
  })
}

/**
 * Block until the desktop scraper finishes. Only for long-lived Node (local
 * `server.js`). On Vercel, use enqueue + client poll + finalize instead.
 */
export async function waitForScraperJob(jobId: string, timeoutMs = JOB_WAIT_MS) {
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    const job = await prisma.scraperJob.findUnique({ where: { id: jobId } })
    if (!job) {
      throw new Error("Scraper job not found")
    }
    if (job.status === ScraperJobStatus.COMPLETED) {
      return job
    }
    if (job.status === ScraperJobStatus.FAILED) {
      throw new Error(job.error ?? "Run scraper failed")
    }
    await sleep(1000)
  }

  await prisma.scraperJob.update({
    where: { id: jobId },
    data: {
      status: ScraperJobStatus.FAILED,
      error: "Timed out waiting for your computer to finish the sync",
      completedAt: new Date(),
    },
  })

  throw new Error(
    "Timed out waiting for your computer. Keep the scraper running and complete any Cloudflare check in the browser."
  )
}

export const LOCAL_SCRAPER_HINT =
  "The scraper is not running. Open Run Scraper, install it on your computer if needed, and run the command."

function allowSyncWait() {
  // Explicit opt-in, or local custom server (not Vercel / serverless).
  if (process.env.SCRAPER_SYNC_WAIT === "1") return true
  if (process.env.SCRAPER_SYNC_WAIT === "0") return false
  if (process.env.VERCEL) return false
  return process.env.NODE_ENV !== "production"
}

/**
 * Enqueue and optionally wait (local/dev only). Prefer enqueueScraperJob +
 * client poll on Vercel.
 */
export async function runScraperJob<T>(
  userId: string,
  type: ScraperJobType,
  payload: Prisma.InputJsonValue
): Promise<T> {
  const job = await enqueueScraperJob(userId, type, payload)
  if (!allowSyncWait()) {
    throw new Error(
      "Scraper jobs must be polled on this host. Use enqueue + GET /api/scraper/jobs/[id] + finalize."
    )
  }
  const timeoutMs =
    process.env.VERCEL || process.env.SCRAPER_SYNC_WAIT === "1"
      ? VERCEL_SAFE_WAIT_MS
      : JOB_WAIT_MS
  const finished = await waitForScraperJob(job.id, timeoutMs)
  return finished.result as T
}
