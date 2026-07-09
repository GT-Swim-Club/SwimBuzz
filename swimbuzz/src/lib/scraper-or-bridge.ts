import { BridgeJobType, Prisma } from "@prisma/client"
import { getActiveBridgeConnection, runBridgeJob } from "@/lib/bridge"
import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { FormData as UndiciFormData } from "undici"

export const LOCAL_BRIDGE_HINT =
  "Local sync is not connected. Open Local sync, install the bridge on your computer, and run the connect command — PDF import runs through your machine on the hosted app."

function isDeployedWithoutScraper() {
  return Boolean(process.env.RENDER) && SCRAPER_URL.includes("localhost")
}

function toBuffer(bytes: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(bytes)) return bytes
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes)
  return Buffer.from(bytes)
}

async function postPdfToScraper<T>(
  endpoint: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  fields: Record<string, string>,
  fileName: string
): Promise<T> {
  const scraperForm = new UndiciFormData()
  const buf = toBuffer(fileBytes)
  scraperForm.append(
    "file",
    new Blob([new Uint8Array(buf)], { type: "application/pdf" }),
    fileName
  )
  for (const [key, value] of Object.entries(fields)) {
    scraperForm.append(key, value)
  }

  let parseRes: Response
  try {
    parseRes = await fetchScraper(`${SCRAPER_URL}/${endpoint}`, {
      method: "POST",
      body: scraperForm as unknown as BodyInit,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "connection failed"
    throw new Error(`Could not reach PDF parser at ${SCRAPER_URL}: ${message}`)
  }

  if (!parseRes.ok) {
    const err = await parseRes.json().catch(() => ({}))
    const detail = (err as { detail?: string | { msg?: string }[] }).detail
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).filter(Boolean).join(", ")
          : "Failed to parse PDF"
    throw new Error(message)
  }

  return parseRes.json() as Promise<T>
}

export async function parseMeetPdf<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  options: { course: string; team: string; fileName?: string }
): Promise<T> {
  const bridge = await getActiveBridgeConnection(userId)
  if (bridge) {
    return runBridgeJob<T>(userId, BridgeJobType.PARSE_MEET_PDF, {
      file_b64: toBuffer(fileBytes).toString("base64"),
      course: options.course,
      team: options.team,
    } satisfies Prisma.InputJsonObject)
  }

  if (isDeployedWithoutScraper()) {
    throw new Error(LOCAL_BRIDGE_HINT)
  }

  return postPdfToScraper<T>("parse-meet-pdf", fileBytes, {
    course: options.course,
    team: options.team,
  }, options.fileName ?? "meet-results.pdf")
}

export async function parseMeetSheetPdf<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array,
  options: { sheetType: "psych" | "heat" | "entries"; team: string }
): Promise<T> {
  const bridge = await getActiveBridgeConnection(userId)
  if (bridge) {
    return runBridgeJob<T>(userId, BridgeJobType.PARSE_MEET_SHEET, {
      file_b64: toBuffer(fileBytes).toString("base64"),
      sheet_type: options.sheetType,
      team: options.team,
    } satisfies Prisma.InputJsonObject)
  }

  if (isDeployedWithoutScraper()) {
    throw new Error(LOCAL_BRIDGE_HINT)
  }

  return postPdfToScraper<T>("parse-meet-sheet-pdf", fileBytes, {
    sheet_type: options.sheetType,
    team: options.team,
  }, "meet-sheet.pdf")
}

export async function parseMeetPacketPdfResult<T>(
  userId: string,
  fileBytes: Buffer | ArrayBuffer | Uint8Array
): Promise<T> {
  const bridge = await getActiveBridgeConnection(userId)
  if (bridge) {
    return runBridgeJob<T>(userId, BridgeJobType.PARSE_MEET_PACKET, {
      file_b64: toBuffer(fileBytes).toString("base64"),
    } satisfies Prisma.InputJsonObject)
  }

  if (isDeployedWithoutScraper()) {
    throw new Error(LOCAL_BRIDGE_HINT)
  }

  return postPdfToScraper<T>("parse-meet-packet-pdf", fileBytes, {}, "meet-packet.pdf")
}
