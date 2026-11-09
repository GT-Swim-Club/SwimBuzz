import { NextResponse } from "next/server"
import { attachmentDisposition, recordsAsOfLabel } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { listTeamRecords } from "@/lib/records/records"
import { buildRecordsPdf, recordsPdfFilename } from "@/lib/records/records-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The team records sheet as a PDF. Anyone signed in can see the records, so anyone can export them. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { rows } = await listTeamRecords()
  const bytes = new Uint8Array(buildRecordsPdf({ rows, asOf: recordsAsOfLabel() }).output("arraybuffer"))

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(recordsPdfFilename()),
      "Cache-Control": "no-store",
    },
  })
}
