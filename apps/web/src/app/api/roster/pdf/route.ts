import { NextResponse } from "next/server"
import {
  athleteDisplayName,
  athleteYearForSeason,
  attachmentDisposition,
  formatAcademicYear,
  rosterPdfFilename,
  rosterPdfTitle,
  swimCloudTimesStatus,
  type AthleteClearanceSummary,
} from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { athleteAge } from "@/lib/utils"
import { CLEARANCE_OPTIONS, rosterFilterLabel, SWIMCLOUD_OPTIONS } from "@/lib/roster/roster-filters"
import { loadRosterExportAthletes, readRosterExportScope } from "@/lib/roster/roster-export"
import { buildRosterPdf, type RosterPdfCell, type RosterPdfColumn } from "@/lib/roster/roster-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clearanceCell(item: AthleteClearanceSummary["physical"]): RosterPdfCell {
  return item.cleared ? { text: "Complete", tone: "complete" } : { text: "Incomplete", tone: "missing" }
}

function swimCloudCell(swimCloudIds: number[], timesSyncedAt: Date | null): RosterPdfCell {
  const status = swimCloudTimesStatus(swimCloudIds, timesSyncedAt)
  if (status === "unlinked") return { text: "No profile", tone: "missing" }
  if (status === "never" || !timesSyncedAt) return { text: "Never imported", tone: "partial" }
  const date = timesSyncedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  return { text: date, tone: "complete" }
}

/**
 * The roster as a PDF, as the page shows it: `season` (else every season), `gender`, the search
 * `q`, and — for staff — `clearance` and `swimcloud` filters plus Physical, Concussion and
 * SwimCloud columns. Anyone signed in can see the roster, so anyone can export it.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scope = await readRosterExportScope(new URL(req.url).searchParams, session.user.role)
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: 400 })
  const { season, staff, filters, query } = scope
  const athletes = await loadRosterExportAthletes(scope)

  const showGender = filters.gender === "all"
  const columns: RosterPdfColumn[] = [
    { label: "Athlete" },
    ...(showGender ? [{ label: "Gender", width: 48 }] : []),
    { label: "Year", width: 62 },
    { label: "Age", width: 32, align: "center" as const },
    ...(staff
      ? [
          { label: "Physical", width: 62 },
          { label: "Concussion", width: 70 },
          { label: "SwimCloud", width: 84 },
        ]
      : []),
  ]

  const tableRows: RosterPdfCell[][] = athletes.map((a) => {
    const year = season ? athleteYearForSeason(a, season) : a.year
    const age = athleteAge(a.dob)
    return [
      { text: athleteDisplayName(a) },
      ...(showGender ? [{ text: a.gender === "F" ? "Women" : "Men" }] : []),
      { text: year ? formatAcademicYear(year) : "—" },
      { text: age != null ? String(age) : "—" },
      ...(staff
        ? [
            clearanceCell(a.clearance.physical),
            clearanceCell(a.clearance.concussion),
            swimCloudCell(a.swimCloudIds, a.timesSyncedAt),
          ]
        : []),
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
