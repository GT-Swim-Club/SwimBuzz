import { NextResponse } from "next/server"
import { attachmentDisposition, recordsAsOfLabel, topTimesExportFilename } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { RecordInputError } from "@/lib/records/records"
import { teamAllTopTimesCached } from "@/lib/records/record-top-times"
import { buildTopTimesPdf } from "@/lib/records/top-times-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Every record event's top 10 for one gender as a PDF, as the records page's Top 10 view shows it:
 * ?gender=F|M&mode=performers|performances. Anyone signed in can see the top 10, so anyone can export it.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(req.url)
  try {
    const data = await teamAllTopTimesCached(url.searchParams.get("gender"), url.searchParams.get("mode"))
    const bytes = new Uint8Array(buildTopTimesPdf({ data, asOf: recordsAsOfLabel() }).output("arraybuffer"))
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentDisposition(topTimesExportFilename(data.gender, data.mode)),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (error instanceof RecordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}
