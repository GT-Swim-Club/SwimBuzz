import { NextResponse } from "next/server"
import { attachmentDisposition, rosterCsvFilename } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { loadRosterExportAthletes, readRosterExportScope } from "@/lib/roster/roster-export"
import { buildRosterCsv } from "@/lib/roster/roster-csv-export"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The roster as CSV, as the page shows it (season, gender, search, and staff's clearance and
 * SwimCloud filters) — the same scope as GET /api/roster/pdf. Anyone signed in can export it;
 * staff also get email, GTID, DOB, SwimCloud IDs and the status columns.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scope = await readRosterExportScope(new URL(req.url).searchParams, session.user.role)
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: 400 })

  const athletes = await loadRosterExportAthletes(scope)
  const csv = buildRosterCsv(athletes, { season: scope.season, staff: scope.staff })

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachmentDisposition(rosterCsvFilename(scope.season)),
      "Cache-Control": "no-store",
    },
  })
}
