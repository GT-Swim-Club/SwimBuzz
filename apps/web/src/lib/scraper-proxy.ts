import { ScraperJobType, Prisma } from "@prisma/client"
import { enqueueScraperJob, waitForScraperJob } from "@/lib/scraper"

export { LOCAL_SCRAPER_HINT } from "@/lib/scraper"

/** Hobby-safe wait for PDF parses invoked from server routes (meet create/update). */
const PDF_WAIT_MS = 240_000

function toBuffer(bytes: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(bytes)) return bytes
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes)
  return Buffer.from(bytes)
}

async function enqueueAndWaitPdfParse<T>(
  userId: string,
  type: ScraperJobType,
  payload: Prisma.InputJsonValue
): Promise<T> {
  const job = await enqueueScraperJob(userId, type, payload)
  const finished = await waitForScraperJob(job.id, PDF_WAIT_MS)
  return finished.result as T
}

export async function parseMeetPdf<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  options: { course: string; team: string; fileName?: string }
): Promise<T> {
  return enqueueAndWaitPdfParse<T>(userId, ScraperJobType.PARSE_MEET_PDF, {
    file_b64: toBuffer(fileBytes).toString("base64"),
    course: options.course,
    team: options.team,
  } satisfies Prisma.InputJsonObject)
}

export async function parseMeetSheetPdf<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  options: { sheetType: "psych" | "heat" | "entries"; team: string }
): Promise<T> {
  return enqueueAndWaitPdfParse<T>(userId, ScraperJobType.PARSE_MEET_SHEET, {
    file_b64: toBuffer(fileBytes).toString("base64"),
    sheet_type: options.sheetType,
    team: options.team,
  } satisfies Prisma.InputJsonObject)
}

export async function parseMeetPacketPdfResult<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array
): Promise<T> {
  return enqueueAndWaitPdfParse<T>(userId, ScraperJobType.PARSE_MEET_PACKET, {
    file_b64: toBuffer(fileBytes).toString("base64"),
  } satisfies Prisma.InputJsonObject)
}

export async function parseNqtPdf<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array
): Promise<T> {
  return enqueueAndWaitPdfParse<T>(userId, ScraperJobType.PARSE_NQT_PDF, {
    file_b64: toBuffer(fileBytes).toString("base64"),
  } satisfies Prisma.InputJsonObject)
}

/** Enqueue-only helpers for client poll + finalize flows. */
export async function enqueueParseMeetPdf(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  options: { course: string; team: string; fileName?: string },
  applyContext?: Prisma.InputJsonValue
) {
  return enqueueScraperJob(
    userId,
    ScraperJobType.PARSE_MEET_PDF,
    {
      file_b64: toBuffer(fileBytes).toString("base64"),
      course: options.course,
      team: options.team,
    } satisfies Prisma.InputJsonObject,
    applyContext
  )
}

export async function enqueueParseNqtPdf(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  applyContext?: Prisma.InputJsonValue
) {
  return enqueueScraperJob(
    userId,
    ScraperJobType.PARSE_NQT_PDF,
    {
      file_b64: toBuffer(fileBytes).toString("base64"),
    } satisfies Prisma.InputJsonObject,
    applyContext
  )
}
