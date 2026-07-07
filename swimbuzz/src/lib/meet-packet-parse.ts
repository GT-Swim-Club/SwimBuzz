import { fetchScraper, SCRAPER_URL } from "@/lib/scraper-fetch"
import { fetchMeetFileBytes } from "@/lib/meet-file-fetch"
import type { EventOrder } from "@/lib/meet-event-order"
import { isEventOrder, isParsablePacketUrl } from "@/lib/meet-event-order"
import { FormData as UndiciFormData } from "undici"

export async function parseMeetPacketPdf(
  packetUrl: string
): Promise<EventOrder | null> {
  if (!isParsablePacketUrl(packetUrl)) return null

  const bytes = await fetchMeetFileBytes(packetUrl)
  const scraperForm = new UndiciFormData()
  scraperForm.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    "meet-packet.pdf"
  )

  let parseRes: Response
  try {
    parseRes = await fetchScraper(`${SCRAPER_URL}/parse-meet-packet-pdf`, {
      method: "POST",
      body: scraperForm as unknown as BodyInit,
    })
  } catch {
    throw new Error(
      "Could not reach packet parser — is the scraper running on port 8000?"
    )
  }

  if (!parseRes.ok) {
    const err = await parseRes.json().catch(() => ({}))
    const detail = (err as { detail?: string | { msg?: string }[] }).detail
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).filter(Boolean).join(", ")
          : "Failed to parse meet packet"
    throw new Error(message)
  }

  const parsed = await parseRes.json()
  if (!isEventOrder(parsed)) {
    throw new Error("Parser returned an invalid event order")
  }
  return parsed
}

/** Parse packet when URL changes; returns eventOrder to store (null if cleared/unparseable). */
export async function resolveEventOrderForPacket(
  packetUrl: string | null | undefined
): Promise<EventOrder | null> {
  if (!packetUrl || !isParsablePacketUrl(packetUrl)) return null
  return parseMeetPacketPdf(packetUrl)
}
