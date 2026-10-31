import { NextResponse } from "next/server"
import { attachmentDisposition, meetHeaderDetails, rosterSummaryPdfFilename } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"
import { loadMeetIconPng } from "@/lib/meet/meet-icon-png"
import { buildRosterSummaryPdf, parseRosterSummaryPdfRequest } from "@/lib/meet/roster-summary-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The roster summary as a PDF. The client posts the view it is showing (its own filters and
 * search applied) and this only lays it out, so anyone who can see the summary can export it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const meet = await prisma.meet.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { name: true, location: true, school: true, startsAt: true, endsAt: true, timeZone: true, iconUrl: true },
  })
  if (!meet) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const request = parseRosterSummaryPdfRequest(await req.json().catch(() => null))
  if (!request) return NextResponse.json({ error: "Invalid roster summary" }, { status: 400 })

  const iconPng = await loadMeetIconPng(meet.iconUrl)
  const bytes = new Uint8Array(
    buildRosterSummaryPdf({ meetName: meet.name, details: meetHeaderDetails(meet), iconPng, request }).output("arraybuffer")
  )
  const filename = rosterSummaryPdfFilename(meet.name, request)

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(filename),
      "Cache-Control": "no-store",
    },
  })
}
