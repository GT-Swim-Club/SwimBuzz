import { NextResponse } from "next/server"
import { attachmentDisposition } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { buildRelaysPdf, relaysPdfFilename } from "@/lib/meet/relay-pdf"
import { loadRelaysPdfInput } from "@/lib/meet/relay-pdf-load"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Published relays as a PDF. Anyone signed in can view published relays, so anyone can export them. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const input = await loadRelaysPdfInput(id)
  if (!input || input.events.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const bytes = new Uint8Array(buildRelaysPdf(input).output("arraybuffer"))
  const filename = relaysPdfFilename(input.meetName)

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(filename),
      "Cache-Control": "no-store",
    },
  })
}
