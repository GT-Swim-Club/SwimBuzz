import { NextResponse } from "next/server"
import {
  athleteDisplayName,
  athleteYearForSeason,
  attachmentDisposition,
  formatAcademicYear,
  rosterPdfFilename,
  rosterPdfTitle,
} from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { athleteAge } from "@/lib/utils"
import { CLEARANCE_OPTIONS, rosterFilterLabel, SWIMCLOUD_OPTIONS } from "@/lib/roster/roster-filters"
import { loadRosterExportAthletes, readRosterExportScope } from "@/lib/roster/roster-export"
import { buildRosterPdf, type RosterPdfCell, type RosterPdfColumn } from "@/lib/roster/roster-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The roster as a PDF, as the page shows it: `season` (else every season), `gender`, the search
 * `q`, and — for staff — `clearance` and `swimcloud` filters. Columns are Athlete, Gender (when
 * both genders are shown), Year and Age. Anyone signed in can see the roster, so anyone can export it.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scope = await readRosterExportScope(new URL(req.url).searchParams, session.user.role)
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: 400 })
  const { season, filters, query } = scope
  const athletes = await loadRosterExportAthletes(scope)

  const showGender = filters.gender === "all"
  const columns: RosterPdfColumn[] = [
    { label: "Athlete" },
    // Half a page wide per table (two side by side), so these are as narrow as their headers allow.
    ...(showGender ? [{ label: "Gender", width: 48 }] : []),
    { label: "Year", width: 50 },
    { label: "Age", width: 30, align: "center" as const },
  ]

  const tableRows: RosterPdfCell[][] = athletes.map((a) => {
    const year = season ? athleteYearForSeason(a, season) : a.year
    const age = athleteAge(a.dob)
    return [
      { text: athleteDisplayName(a) },
      ...(showGender ? [{ text: a.gender === "F" ? "Women" : "Men" }] : []),
      { text: year ? formatAcademicYear(year) : "—" },
      { text: age != null ? String(age) : "—" },
    ]
  })

  const details = [
    filters.gender === "F" ? "Women" : filters.gender === "M" ? "Men" : null,
    `${athletes.length} ${athletes.length === 1 ? "athlete" : "athletes"}`,
    filters.clearance !== "all" ? rosterFilterLabel(CLEARANCE_OPTIONS, filters.clearance) : null,
    filters.swimcloud !== "all" ? `SwimCloud: ${rosterFilterLabel(SWIMCLOUD_OPTIONS, filters.swimcloud)}` : null,
    query ? `Search “${query}”` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const doc = buildRosterPdf({
    title: rosterPdfTitle(season),
    details,
    columns,
    rows: tableRows,
    emptyMessage: query ? `No athletes match “${query}”.` : "No athletes match these filters.",
  })
  const bytes = new Uint8Array(doc.output("arraybuffer"))

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": attachmentDisposition(rosterPdfFilename(season)),
      "Cache-Control": "no-store",
    },
  })
}
