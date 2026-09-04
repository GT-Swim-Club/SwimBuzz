import type { EventOrder } from "@/lib/meet/meet-event-order"
import { isEventOrder, isParsablePacketUrl } from "@/lib/meet/meet-event-order"
import { parseMeetPacketPdfResult } from "@/lib/meet/pdf-parser-client"

export async function parseMeetPacketPdf(
  userId: string,
  packetUrl: string
): Promise<EventOrder | null> {
  if (!isParsablePacketUrl(packetUrl)) return null

  const parsed = await parseMeetPacketPdfResult<EventOrder>(userId, packetUrl)
  if (!isEventOrder(parsed)) {
    throw new Error("Parser returned an invalid event order")
  }
  return parsed
}

/** Parse packet when URL changes; returns eventOrder to store (null if cleared/unparseable). */
export async function resolveEventOrderForPacket(
  userId: string,
  packetUrl: string | null | undefined
): Promise<EventOrder | null> {
  if (!packetUrl || !isParsablePacketUrl(packetUrl)) return null
  return parseMeetPacketPdf(userId, packetUrl)
}
