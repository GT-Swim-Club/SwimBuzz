import { ScraperJobType, Prisma } from "@prisma/client"
import { runScraperJob } from "@/lib/scraper"

export { LOCAL_SCRAPER_HINT } from "@/lib/scraper"

function toBuffer(bytes: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(bytes)) return bytes
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes)
  return Buffer.from(bytes)
}

export async function parseMeetPdf<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  options: { course: string; team: string; fileName?: string }
): Promise<T> {
  return runScraperJob<T>(userId, ScraperJobType.PARSE_MEET_PDF, {
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
  return runScraperJob<T>(userId, ScraperJobType.PARSE_MEET_SHEET, {
    file_b64: toBuffer(fileBytes).toString("base64"),
    sheet_type: options.sheetType,
    team: options.team,
  } satisfies Prisma.InputJsonObject)
}

export async function parseMeetPacketPdfResult<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array
): Promise<T> {
  return runScraperJob<T>(userId, ScraperJobType.PARSE_MEET_PACKET, {
    file_b64: toBuffer(fileBytes).toString("base64"),
  } satisfies Prisma.InputJsonObject)
}

export async function parseNqtPdf<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array
): Promise<T> {
  return runScraperJob<T>(userId, ScraperJobType.PARSE_NQT_PDF, {
    file_b64: toBuffer(fileBytes).toString("base64"),
  } satisfies Prisma.InputJsonObject)
}
